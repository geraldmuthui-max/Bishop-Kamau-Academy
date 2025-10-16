import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { simpleNameSchema } from "../utils/validators.js";

const router = Router();
const subjects = () => db().collection(nsCol("subjects"));

router.get("/subjects", requireAuth, async (_req, res, next) => {
  try {
    const snap = await subjects().orderBy("name").get();
    res.json({ ok:true, data: snap.docs.map(d => ({ id:d.id, ...d.data() })) });
  } catch (e) { next(e); }
});

router.post("/subjects", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { error, value } = simpleNameSchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });
    const ref = await subjects().add({ name:value.name, createdAt:new Date() });
    const doc = await ref.get();
    res.status(201).json({ ok:true, data: { id:doc.id, ...doc.data() } });
  } catch (e) { next(e); }
});

export default router;
