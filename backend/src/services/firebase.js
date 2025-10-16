// backend/src/services/firebase.js
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

/**
 * Initialize Firebase Admin using either:
 *  - FIREBASE_SERVICE_ACCOUNT_BASE64 (Base64 of service-account JSON), OR
 *  - GOOGLE_APPLICATION_CREDENTIALS (file path to service-account JSON), OR
 *  - Application Default Credentials (if configured)
 */
function initAdmin() {
  const b64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  const hasB64 = !!b64;
  const hasGac = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!getApps().length) {
    if (hasB64) {
      try {
        const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
        initializeApp({ credential: cert(json) });
        console.log("[firebase] Admin initialized from FIREBASE_SERVICE_ACCOUNT_BASE64");
      } catch (e) {
        console.error("[firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:", e?.message || e);
        throw e;
      }
    } else if (hasGac) {
      initializeApp({ credential: applicationDefault() });
      console.log("[firebase] Admin initialized from GOOGLE_APPLICATION_CREDENTIALS");
    } else {
      initializeApp({ credential: applicationDefault() });
      console.warn("[firebase] Admin initialized with Application Default Credentials (ensure they are valid)");
    }
  }
}

initAdmin();

const firestore = getAdminFirestore();
const authAdmin = getAdminAuth();

/** Namespacing helper (leave FS_NAMESPACE blank to use prod collections) */
const NS = (process.env.FS_NAMESPACE || "").trim();
export function nsCol(name) { return NS ? `${NS}__${name}` : name; }
export function db() { return firestore; }
export function auth() { return authAdmin; }
