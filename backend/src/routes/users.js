import { Router } from "express";
import { db, nsCol, auth } from "../services/firebase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createUserSchema, changePasswordSchema, changeRoleSchema } from "../utils/validators.js";

const router = Router();
const usersCol = () => db().collection(nsCol("users"));

// List users (admin)
router.get("/users", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const snap = await usersCol().orderBy("createdAt","desc").limit(500).get();
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e) { next(e); }
});

// Create user (admin)
router.post("/users", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { error, value } = createUserSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ ok:false, error: error.message });

    const userRecord = await auth().createUser({
      email: value.email,
      password: value.password,
      displayName: value.displayName
    });

    // Save role and profile doc
    await usersCol().doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: value.email,
      displayName: value.displayName,
      role: value.role,
      approved: true,
      createdAt: new Date()
    }, { merge: true });

    // Also set a custom claim for role (optional)
    await auth().setCustomUserClaims(userRecord.uid, { role: value.role });

    res.status(201).json({
      ok: true,
      data: { uid: userRecord.uid, email: value.email, displayName: value.displayName, role: value.role }
    });
  } catch (e) { next(e); }
});

// Change password (admin)
router.patch("/users/:uid/password", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ ok:false, error: error.message });

    await auth().updateUser(req.params.uid, { password: value.password });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Change role (admin)
router.patch("/users/:uid/role", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { error, value } = changeRoleSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ ok:false, error: error.message });

    await usersCol().doc(req.params.uid).set({ role: value.role, updatedAt: new Date() }, { merge: true });
    await auth().setCustomUserClaims(req.params.uid, { role: value.role });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Approve / unapprove user doc (admin)
router.patch("/users/:uid/approve", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const approved = !!req.body?.approved;
    await usersCol().doc(req.params.uid).set({ approved, updatedAt: new Date() }, { merge: true });
    res.json({ ok: true, data: { uid: req.params.uid, approved } });
  } catch (e) { next(e); }
});

// Delete user doc (admin) – does not delete auth user
router.delete("/users/:uid", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    await usersCol().doc(req.params.uid).delete();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
