// scripts/checkBackend.mjs
// Usage:
// node scripts/checkBackend.mjs --api http://localhost:4001 --key <WEB_API_KEY> --email <user> --password <pass> [--year 2025] [--term 1]

const args = Object.fromEntries(process.argv.slice(2).map(p => {
  const m = p.match(/^--([^=]+)=(.*)$/);
  if (m) return [m[1], m[2]];
  if (p.startsWith("--")) return [p.replace(/^--/,""), true];
  return [p, true];
}));

const API_BASE = (args.api || "http://localhost:4001").replace(/\/$/, "");
const API_KEY  = args.key; // Firebase Web API Key
const EMAIL    = args.email;
const PASSWORD = args.password;
const YEAR     = Number(args.year || new Date().getFullYear());
const TERM     = Number(args.term || 1);

if (!API_KEY || !EMAIL || !PASSWORD) {
  console.error("Missing --key, --email, or --password");
  process.exit(1);
}

async function signinWithPassword(key, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${JSON.stringify(data)}`);
  return data.idToken;
}

async function callApi(token, path) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      "Content-Type":"application/json",
      "Authorization": `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

(async () => {
  console.log("Signing in…");
  const token = await signinWithPassword(API_KEY, EMAIL, PASSWORD);

  console.log("→ GET /classes");
  let r = await callApi(token, "/classes");
  console.log(r.status, Array.isArray(r.body?.data) ? `count=${r.body.data.length}` : r.body);

  console.log("→ GET /students");
  r = await callApi(token, "/students");
  console.log(r.status, Array.isArray(r.body?.data) ? `count=${r.body.data.length}` : r.body);

  let firstId = Array.isArray(r.body?.data) && r.body.data[0]?.id;
  if (firstId) {
    console.log(`→ GET /finance/learner/${firstId}/balance?year=${YEAR}&term=${TERM}`);
    const bal = await callApi(token, `/finance/learner/${encodeURIComponent(firstId)}/balance?year=${YEAR}&term=${TERM}`);
    console.log(bal.status, bal.body);
  } else {
    console.log("No students found; skipping balance check.");
  }
})().catch(e => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});
