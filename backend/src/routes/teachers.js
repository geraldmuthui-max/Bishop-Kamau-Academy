import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createTeacherSchema } from "../utils/validators.js";

const router = Router();
const teachers = () => db().collection(nsCol("teachers"));

router.get("/teachers", requireAuth, async (_req, res, next) => {
  try {
    const snap = await teachers().orderBy("name").get();
    res.json({ ok:true, data: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
  } catch (e) { next(e); }
});

router.post("/teachers", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { error, value } = createTeacherSchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });
    const ref = await teachers().add({ ...value, createdAt:new Date() });
    const doc = await ref.get();
    res.status(201).json({ ok:true, data:{ id:doc.id, ...doc.data() } });
  } catch (e) { next(e); }
});

export default router;
