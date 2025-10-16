import { Router } from "express";
import { db, nsCol } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createLearnerSchema, updateLearnerSchema } from "../utils/validators.js";

const router = Router();
const studentsCol = () => db().collection(nsCol("students"));
const enrollmentsCol = () => db().collection(nsCol("student_enrollments"));

async function listStudents(req, res, next) {
  try {
    const role = req.user?.role || "user";
    const classId = req.query.classId;
    const year = req.query.year ? parseInt(req.query.year) : null;
    const term = req.query.term ? parseInt(req.query.term) : null;

    // If year/term specified, use enrollment-based filtering
    if (year && term) {
      // Get enrollments for this year/term
      let enrollQuery = enrollmentsCol()
        .where("year", "==", year)
        .where("term", "==", term);
      
      const enrollSnap = await enrollQuery.limit(1000).get();
      const enrollmentMap = new Map();
      const studentIds = [];

      enrollSnap.forEach(doc => {
        const data = doc.data();
        if (data.studentId && data.classId) {
          enrollmentMap.set(data.studentId, data.classId);
          studentIds.push(data.studentId);
        }
      });

      if (studentIds.length === 0) {
        return res.json({ ok: true, data: [] });
      }

      // Get student records (Firestore 'in' query supports max 10 items, so batch)
      const students = [];
      const batchSize = 10;
      for (let i = 0; i < studentIds.length; i += batchSize) {
        const batch = studentIds.slice(i, i + batchSize);
        const snap = await studentsCol()
          .where("__name__", "in", batch)
          .get();
        
        snap.forEach(doc => {
          const data = doc.data();
          const enrolledClassId = enrollmentMap.get(doc.id);
          students.push({
            id: doc.id,
            ...data,
            classId: enrolledClassId || data.classId // Use enrollment class
          });
        });
      }

      // Apply classId filter if needed
      let filtered = students;
      if (role !== "admin" && classId) {
        filtered = students.filter(s => s.classId === classId);
      }

      return res.json({ ok: true, data: filtered });
    }

    // Default: simple query on students collection
    let q = studentsCol();
    if (role !== "admin" && classId) {
      q = q.where("classId", "==", classId);
    }
    
    const snap = await q.limit(500).get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}

async function createStudent(req, res, next) {
  try {
    const { error, value } = createLearnerSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ ok: false, error: error.message });
    const ref = await studentsCol().add({ ...value, createdAt: new Date() });
    const doc = await ref.get();
    res.status(201).json({ ok: true, data: { id: doc.id, ...doc.data() } });
  } catch (e) {
    next(e);
  }
}

async function updateStudent(req, res, next) {
  try {
    const { error, value } = updateLearnerSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ ok: false, error: error.message });
    await studentsCol().doc(req.params.id).set({ ...value, updatedAt: new Date() }, { merge: true });
    const doc = await studentsCol().doc(req.params.id).get();
    res.json({ ok: true, data: { id: doc.id, ...doc.data() } });
  } catch (e) {
    next(e);
  }
}

async function deleteStudent(req, res, next) {
  try {
    await studentsCol().doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

/* ---------- Primary routes (students) ---------- */
router.get("/students", requireAuth, listStudents);
router.post("/students", requireAuth, requireRole("admin", "staff"), createStudent);
router.patch("/students/:id", requireAuth, requireRole("admin", "teacher", "staff"), updateStudent);
router.delete("/students/:id", requireAuth, requireRole("admin"), deleteStudent);

/* ---------- Back-compat aliases (learners) ---------- */
router.get("/learners", requireAuth, listStudents);
router.post("/learners", requireAuth, requireRole("admin", "staff"), createStudent);
router.patch("/learners/:id", requireAuth, requireRole("admin", "teacher", "staff"), updateStudent);
router.delete("/learners/:id", requireAuth, requireRole("admin"), deleteStudent);

export default router;