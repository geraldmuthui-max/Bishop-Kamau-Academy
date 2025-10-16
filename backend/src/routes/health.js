import { Router } from "express";
const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, status: "healthy" }));

export default router;
