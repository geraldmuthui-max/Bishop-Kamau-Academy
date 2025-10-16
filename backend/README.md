# School System Backend

Express + Firebase Admin backend covering learners, classes, teachers, assignments, subjects, voteheads, marks, and finance (fees templates, payments, balances).

## Quick Start

```bash
cd backend
cp .env.example .env
# Fill in FIREBASE_SERVICE_ACCOUNT_BASE64 or GOOGLE_APPLICATION_CREDENTIALS
npm i
npm run dev
```

Server starts on `http://localhost:${PORT:-4001}`

## Routes (prefix `/api`)

- `GET /health`
- **Users (admin):** `GET /users`, `POST /users`, `PATCH /users/:uid/password`, `PATCH /users/:uid/role`, `PATCH /users/:uid/approve`, `DELETE /users/:uid`
- **Learners:** `GET /learners`, `POST /learners`, `PATCH /learners/:id`, `DELETE /learners/:id`
- **Classes:** `GET /classes`, `POST /classes`, `PATCH /classes/:id/rename`, `PATCH /classes/:id/capacity`, `DELETE /classes/:id`
- **Subjects:** `GET /subjects`, `POST /subjects`
- **Voteheads:** `GET /voteheads`, `POST /voteheads`
- **Teachers:** `GET /teachers`, `POST /teachers`
- **Assignments:** `POST /teacher-assignments`, `GET /teacher-assignments/:teacherId`
- **Marks:** `POST /marks/batch`, `GET /marks`
- **Finance:** `POST /finance/assign-class-fees`, `GET /finance/class-fee-template`, `POST /finance/record-payment`, `GET /finance/learner/:learnerId/history`, `GET /finance/learner/:learnerId/balance`

## Auth

All protected routes expect `Authorization: Bearer <Firebase ID token>`.
Role is resolved from `users/{uid}.role` or custom claims. Use `requireRole(...)` to gate endpoints.

## Notes

- Payments are idempotent via `idempotencyKey`.
- Optional `FS_NAMESPACE` to isolate environments by prefixing collection names.
- Adjust `CORS_ORIGIN` to match your frontend URLs.
- This replaces remaining Firestore client writes (class capacity, payments, user approve/delete). You can add more endpoints for plans/history if needed.
