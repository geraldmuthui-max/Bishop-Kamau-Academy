import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import errorHandler from "./middleware/error.js";

// Routers
import healthRouter from "./routes/health.js";
import usersRouter from "./routes/users.js";
// ⬇️ was: learnersRouter; now studentsRouter
import studentsRouter from "./routes/students.js";
import classesRouter from "./routes/classes.js";
import subjectsRouter from "./routes/subjects.js";
import voteheadsRouter from "./routes/voteheads.js";
import teachersRouter from "./routes/teachers.js";
import assignmentsRouter from "./routes/assignments.js";
import marksRouter from "./routes/marks.js";
import financeRouter from "./routes/finance.js";

const app = express();

// Security / basics
app.use(helmet());
const allow = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allow.length === 0 || allow.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed"), false);
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 60_000, max: 600 }));

// Routes
app.use("/api", healthRouter);
app.use("/api", usersRouter);
// ⬇️ mount students router (also serves /learners aliases for back-compat)
app.use("/api", studentsRouter);
app.use("/api", classesRouter);
app.use("/api", subjectsRouter);
app.use("/api", voteheadsRouter);
app.use("/api", teachersRouter);
app.use("/api", assignmentsRouter);
app.use("/api", marksRouter);
app.use("/api", financeRouter);

// 404
app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
  console.log(`Allowed origins: ${allow.join(", ") || "(none set)"}`);
});
