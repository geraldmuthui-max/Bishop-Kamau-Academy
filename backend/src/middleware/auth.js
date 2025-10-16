import { auth, db, nsCol } from "../services/firebase.js";

// Attach req.user from Firebase ID token. Accepts:
// - Authorization: Bearer <token>
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const decoded = await auth().verifyIdToken(token);
    const userDoc = await db().collection(nsCol("users")).doc(decoded.uid).get();
    const profile = userDoc.exists ? userDoc.data() : {};
    req.user = { uid: decoded.uid, email: decoded.email, role: profile?.role || decoded.role || decoded.customClaims?.role || "user" };
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role || "user";
    if (!roles.includes(role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    next();
  };
}
