export default function errorHandler(err, req, res, _next) {
  console.error(err);
  const code = err.status || 500;
  res.status(code).json({ ok: false, error: err.message || "Server error" });
}
