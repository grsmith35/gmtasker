# Contractor Work Orders (V1)

A V1 progressive web app for contractor work orders:
- GM creates work orders, tracks parts, and assigns when parts are ready
- Contractors get SMS on assignment and submit completion package (hours + notes + photos)
- GM reviews completion, can close or send back
- Task comments + task history/audit feed

## Tech
- Web: React + TypeScript + Tailwind + Vite + PWA
- Server: Node.js + TypeScript + Express + Postgres + Drizzle ORM
- SMS: Twilio (env-driven; safe to run without creds)
- File uploads: local `server/uploads` (swap to S3 later)

---

## Quick Start (Docker)
```bash
npm install
npm run docker:up
```

Open:
- Web: http://localhost:5173
- API: http://localhost:4000/health

### Seeded GM user
- gm@demo.com / DemoPass123!

---

## Twilio (optional)
Set in `server/.env`:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_FROM_NUMBER
- APP_BASE_URL (default: http://localhost:5173)

If not set, SMS sending is skipped and logged.

---

## Rules (Option A)
- GM can set any status / hold reason in any order.
- Assignment is blocked unless all REQUIRED parts are **approved** + **arrived** (unless Force Assign is toggled).
- History feed records status changes, holds, assignments, part updates, completion submissions, and reviews.
