import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { saveAssignmentsSchema } from "../utils/validators.js";

const router = Router();
const assignmentsDoc = (teacherId) => db().collection(nsCol("teacher_assignments")).doc(teacherId);

// Save teacher assignments (class/subject pairs)
router.post("/teacher-assignments", requireAuth, requireRole("admin","staff","teacher"), async (req, res, next) => {
  try {
    const { error, value } = saveAssignmentsSchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });
    await assignmentsDoc(value.teacherId).set({ assignments: value.assignments, updatedAt: new Date() }, { merge:true });
    const doc = await assignmentsDoc(value.teacherId).get();
    res.json({ ok:true, data:{ id: doc.id, ...doc.data() } });
  } catch (e) { next(e); }
});

// Read teacher assignments
router.get("/teacher-assignments/:teacherId", requireAuth, async (req, res, next) => {
  try {
    const doc = await assignmentsDoc(req.params.teacherId).get();
    res.json({ ok:true, data: doc.exists ? { id: doc.id, ...doc.data() } : null });
  } catch (e) { next(e); }
});

export default router;
