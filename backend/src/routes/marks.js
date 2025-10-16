import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { marksBatchSchema } from "../utils/validators.js";

const router = Router();
const marks = () => db().collection(nsCol("marks"));

// Upsert marks batch
router.post("/marks/batch", requireAuth, requireRole("admin","teacher","staff"), async (req, res, next) => {
  try {
    const { error, value } = marksBatchSchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });

    const now = new Date();
    const batch = db().batch();

    for (const entry of value.entries) {
      const key = `${value.year}_${value.term}_${value.classId}_${value.subjectId}_${entry.learnerId}`;
      const ref = marks().doc(key);
      batch.set(ref, {
        year: value.year,
        term: value.term,
        classId: value.classId,
        subjectId: value.subjectId,
        learnerId: entry.learnerId,
        score: entry.score ?? null,
        outOf: entry.outOf ?? 100,
        comment: entry.comment || "",
        updatedAt: now
      }, { merge: true });
    }

    await batch.commit();
    res.json({ ok:true });
  } catch (e) { next(e); }
});

// Get marks for filters
router.get("/marks", requireAuth, async (req, res, next) => {
  try {
    const { year, term, classId, subjectId } = req.query;
    let q = marks();
    if (year) q = q.where("year", "==", Number(year));
    if (term) q = q.where("term", "==", Number(term));
    if (classId) q = q.where("classId", "==", String(classId));
    if (subjectId) q = q.where("subjectId", "==", String(subjectId));
    const snap = await q.limit(1000).get();
    res.json({ ok:true, data: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
  } catch (e) { next(e); }
});

export default router;
