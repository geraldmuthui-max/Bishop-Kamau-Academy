// backend/src/routes/voteheads.js
import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createVoteheadSchema } from "../utils/validators.js";

/**
 * NOTE:
 * Frontend is listening/writing to 'finance_voteheads'.
 * To keep the system consistent, this router uses that same collection.
 */
const router = Router();
const voteheads = () => db().collection(nsCol("finance_voteheads"));

// List voteheads
router.get("/voteheads", requireAuth, async (_req, res, next) => {
  try {
    const snap = await voteheads().orderBy("name").get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// Create a votehead
router.post("/voteheads", requireAuth, requireRole("admin", "staff"), async (req, res, next) => {
  try {
    const { error, value } = createVoteheadSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ ok: false, error: error.message });

    const ref = await voteheads().add({ ...value, createdAt: new Date() });
    const doc = await ref.get();
    res.status(201).json({ ok: true, data: { id: ref.id, ...doc.data() } });
  } catch (e) {
    next(e);
  }
});

export default router;
