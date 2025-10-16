// backend/src/routes/classes.js
import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createClassSchema, renameClassSchema, setClassCapacitySchema } from "../utils/validators.js";

const router = Router();
const classesCol  = () => db().collection(nsCol("classes"));
const studentsCol = () => db().collection(nsCol("students"));
const learnersCol = () => db().collection(nsCol("learners"));

// List
router.get("/classes", requireAuth, async (_req, res, next) => {
  try {
    const snap = await classesCol().orderBy("name").get();

    // Primary: classes collection
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Fallback: derive class list from students/learners if classes is empty
    if (!data.length) {
      let sSnap = await studentsCol().get();
      if (sSnap.empty) sSnap = await learnersCol().get();

      const byId = new Map(); // classId -> className
      sSnap.docs.forEach(d => {
        const x = d.data() || {};
        const cid = x.classId || x.class; // support older schema
        if (!cid) return;
        const classId = String(cid);
        const className =
          x.className || x.class_name || x.stream || x.grade || classId; // best-effort
        byId.set(classId, String(className));
      });

      data = Array.from(byId.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ id, name }));
    }

    return res.json({ ok: true, data });
  } catch (e) { next(e); }
});

// Create
router.post("/classes", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { error, value } = createClassSchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });
    const ref = await classesCol().add({ ...value, createdAt: new Date() });
    const doc = await ref.get();
    res.status(201).json({ ok:true, data: { id: doc.id, ...doc.data() } });
  } catch (e) { next(e); }
});

// Rename
router.patch("/classes/:id/rename", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { error, value } = renameClassSchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });
    await classesCol().doc(req.params.id).set({ name: value.name, updatedAt:new Date() }, { merge:true });
    const doc = await classesCol().doc(req.params.id).get();
    res.json({ ok:true, data: { id: doc.id, ...doc.data() } });
  } catch (e) { next(e); }
});

// Capacity
router.patch("/classes/:id/capacity", requireAuth, requireRole("admin","staff"), async (req, res, next) => {
  try {
    const { error, value } = setClassCapacitySchema.validate(req.body, { abortEarly:false });
    if (error) return res.status(400).json({ ok:false, error: error.message });
    await classesCol().doc(req.params.id).set({ capacity: value.capacity, updatedAt:new Date() }, { merge:true });
    const doc = await classesCol().doc(req.params.id).get();
    res.json({ ok:true, data: { id: doc.id, ...doc.data() } });
  } catch (e) { next(e); }
});

// Delete
router.delete("/classes/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    await classesCol().doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
