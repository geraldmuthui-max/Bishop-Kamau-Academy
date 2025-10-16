// backend/src/routes/finance.js
import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// --- Collections ---
const studentsCol = () => db().collection(nsCol("students"));
const voteheadsCol = () => db().collection(nsCol("finance_voteheads"));
const tmplCol     = () => db().collection(nsCol("class_fee_templates"));

const toInt = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// convenience
const getStudentDocById = async (id) => studentsCol().doc(String(id)).get();
const studentLedger = (id) => studentsCol().doc(String(id)).collection(nsCol("ledger"));

/* -------------------------------------------------------------------------- */
/*                                   Voteheads                                */
/* -------------------------------------------------------------------------- */

router.get("/voteheads", requireAuth, async (_req, res, next) => {
  try {
    const snap = await voteheadsCol().get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data: list });
  } catch (e) { next(e); }
});

router.post("/voteheads", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { name, code, defaultAmount } = req.body || {};
    if (!name) return res.status(400).json({ ok:false, error: "Votehead name is required" });
    const ref = voteheadsCol().doc();
    await ref.set({
      name: String(name),
      code: code ? String(code) : "",
      defaultAmount: toInt(defaultAmount, 0),
      createdAt: new Date()
    });
    const d = await ref.get();
    res.status(201).json({ ok:true, data: { id: ref.id, ...d.data() }});
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/*                             Class fee template                              */
/* -------------------------------------------------------------------------- */

router.get("/finance/class-fee-template", requireAuth, async (req, res, next) => {
  try {
    const { classId, year, term } = req.query;
    if (!classId) return res.status(400).json({ ok:false, error: "classId is required" });
    const id = `${String(classId)}_${toInt(year)}_${toInt(term)}`;
    const doc = await tmplCol().doc(id).get();
    res.json({ ok:true, data: doc.exists ? { id, ...doc.data() } : null });
  } catch (e) { next(e); }
});

router.post("/finance/assign-class-fees", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { classId, year, term, lines } = req.body || {};
    if (!classId || !year || !term || !Array.isArray(lines))
      return res.status(400).json({ ok:false, error: "Missing fields: classId, year, term, lines" });
    const id = `${String(classId)}_${toInt(year)}_${toInt(term)}`;

    // store both "lines" (array) and "distribution" (object) for compatibility
    const distribution = {};
    for (const ln of lines) {
      if (ln?.voteheadId && toInt(ln.amount) > 0) distribution[ln.voteheadId] = toInt(ln.amount);
    }

    await tmplCol().doc(id).set({
      classId: String(classId),
      year: toInt(year),
      term: toInt(term),
      lines: Object.entries(distribution).map(([voteheadId, amount]) => ({ voteheadId, amount })),
      distribution,
      updatedAt: new Date(),
    }, { merge: true });

    const doc = await tmplCol().doc(id).get();
    res.status(201).json({ ok:true, data: { id, ...doc.data() }});
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/*                              Balance (FIXED)                                */
/* -------------------------------------------------------------------------- */

router.get("/finance/learner/:learnerId/balance", requireAuth, async (req, res, next) => {
  try {
    const year   = toInt(req.query.year, new Date().getFullYear());
    const term   = toInt(req.query.term, 1);
    const sid    = String(req.params.learnerId);

    const sDoc = await getStudentDocById(sid);
    if (!sDoc.exists) {
      return res.json({ ok:true, data: { year, term,
        totalDue: 0, totalPaid: 0, balance: 0,
        lines: [], payments: [], perVotehead: {}, totals: { due:0, paid:0, balance:0 }
      }});
    }

    // Get ALL ledger entries (not filtered by term)
    const snap = await studentLedger(sid).get();
    
    // Helper function to check if an entry is on or before the selected term
    const onOrBefore = (entryYear, entryTerm) => {
      const eY = toInt(entryYear);
      const eT = toInt(entryTerm);
      return (eY < year) || (eY === year && eT <= term);
    };

    // Get the class fee template for the CURRENT selected term
    const s = sDoc.data() || {};
    const classId = String(s.classId || "");
    const tmplId  = `${classId}_${year}_${term}`;
    const tDoc    = await tmplCol().doc(tmplId).get();
    const currentTermTemplate = tDoc.exists ? (tDoc.data().lines || []) : [];

    // Separate fees and payments
    const allFees = [];
    const allPayments = [];
    
    snap.forEach(d => {
      const x = d.data();
      const eYear = toInt(x.year);
      const eTerm = toInt(x.term);
      
      // Only include entries on or before the selected term
      if (!onOrBefore(eYear, eTerm)) return;
      
      if (x.type === "payment") {
        allPayments.push({ 
          id: d.id, 
          voteheadId: x.voteheadId,
          amount: toInt(x.amount),
          year: eYear,
          term: eTerm
        });
      } else if (x.type === "fee") {
        allFees.push({ 
          id: d.id, 
          voteheadId: x.voteheadId,
          amount: toInt(x.amount),
          year: eYear,
          term: eTerm
        });
      }
    });

    // Calculate total expected fees up to and including current term
    // If current term has a template, use it for current term, otherwise use ledger fees
    let totalDue = 0;
    const perVotehead = {};

    // Add all fees from PREVIOUS terms (before current term)
    allFees.forEach(f => {
      if (f.year < year || (f.year === year && f.term < term)) {
        totalDue += f.amount;
        const vhId = String(f.voteheadId || 'unallocated');
        perVotehead[vhId] = perVotehead[vhId] || { due: 0, paid: 0, balance: 0 };
        perVotehead[vhId].due += f.amount;
      }
    });

    // For CURRENT term, use template if exists, otherwise use ledger fees
    if (currentTermTemplate.length > 0) {
      // Use template for current term
      currentTermTemplate.forEach(ln => {
        const amt = toInt(ln.amount);
        totalDue += amt;
        const vhId = String(ln.voteheadId);
        perVotehead[vhId] = perVotehead[vhId] || { due: 0, paid: 0, balance: 0 };
        perVotehead[vhId].due += amt;
      });
    } else {
      // Use ledger fees for current term
      allFees.forEach(f => {
        if (f.year === year && f.term === term) {
          totalDue += f.amount;
          const vhId = String(f.voteheadId || 'unallocated');
          perVotehead[vhId] = perVotehead[vhId] || { due: 0, paid: 0, balance: 0 };
          perVotehead[vhId].due += f.amount;
        }
      });
    }

    // Calculate total payments up to and including current term
    let totalPaid = 0;
    let currentTermPaid = 0; // NEW: Track payments for CURRENT term only
    
    allPayments.forEach(p => {
      totalPaid += p.amount;
      // Track current term payments separately
      if (p.year === year && p.term === term) {
        currentTermPaid += p.amount;
      }
      const vhId = String(p.voteheadId || 'unallocated');
      perVotehead[vhId] = perVotehead[vhId] || { due: 0, paid: 0, balance: 0 };
      perVotehead[vhId].paid += p.amount;
    });

    // Calculate balances per votehead
    Object.keys(perVotehead).forEach(vhId => {
      perVotehead[vhId].balance = perVotehead[vhId].due - perVotehead[vhId].paid;
    });

    // Overall totals
    const totals = {
      due: totalDue,
      paid: totalPaid,
      balance: totalDue - totalPaid,
      currentTermPaid: currentTermPaid // NEW: Current term payments only
    };

    res.json({ ok:true, data: {
      year, 
      term,
      totalDue: totals.due,
      totalPaid: totals.paid,
      balance: totals.balance,
      currentTermPaid: totals.currentTermPaid, // NEW
      lines: currentTermTemplate,
      payments: allPayments,
      perVotehead,
      totals
    }});
  } catch (e) { next(e); }
});

/* -------------------------------------------------------------------------- */
/*                      Record payment (shared implementation)                 */
/* -------------------------------------------------------------------------- */

async function recordPaymentImpl(req, res) {
  const { method, amount, receiptNo, studentId, items, year, term } = req.body || {};
  if (!studentId || !method) {
    return res.status(400).json({ ok:false, error: "studentId and method are required" });
  }

  // If amount missing but items provided, compute it.
  let totalAmount = toInt(amount, 0);
  if ((!totalAmount || totalAmount <= 0) && Array.isArray(items) && items.length > 0) {
    totalAmount = items.reduce((s, it) => s + toInt(it?.amount), 0);
  }
  if (!totalAmount || totalAmount <= 0) {
    return res.status(400).json({ ok:false, error: "amount must be > 0 (or provide items with amounts)" });
  }

  const Y = toInt(year, new Date().getFullYear());
  const T = toInt(term, 1);

  const ref = studentLedger(studentId);

  if (Array.isArray(items) && items.length > 0) {
    const batch = db().batch();
    for (const it of items) {
      const docRef = ref.doc();
      batch.set(docRef, {
        type: "payment",
        learnerId: String(studentId),
        voteheadId: it?.voteheadId ? String(it.voteheadId) : undefined,
        amount: toInt(it?.amount),
        method: String(method),
        receiptNo: receiptNo || null,
        year: Y, term: T,
        createdAt: new Date(),
      });
    }
    await batch.commit();
  } else {
    const docRef = ref.doc();
    await docRef.set({
      type: "payment",
      learnerId: String(studentId),
      amount: totalAmount,
      method: String(method),
      receiptNo: receiptNo || null,
      year: Y, term: T,
      createdAt: new Date(),
    });
  }

  return res.json({ ok:true, data: { message: "Payment recorded", year: Y, term: T, amount: totalAmount }});
}

/* --------------------------- Existing endpoint --------------------------- */
// Kept for backwards compatibility (older clients posting here)
router.post("/fees/ledger", requireAuth, requireRole("admin","accounts","staff"), async (req, res, next) => {
  try {
    await recordPaymentImpl(req, res);
  } catch (e) { next(e); }
});

/* ----------------------- New alias for your frontend --------------------- */
// This matches what the frontend calls: POST /api/finance/record-payment
router.post("/finance/record-payment", requireAuth, requireRole("admin","accounts","staff"), async (req, res, next) => {
  try {
    await recordPaymentImpl(req, res);
  } catch (e) { next(e); }
});

export default router;