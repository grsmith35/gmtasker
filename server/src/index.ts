import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { sitesRouter } from "./routes/sites.js";
import { workOrdersRouter } from "./routes/workOrders.js";
import { commentsRouter } from "./routes/comments.js";
import { completionsRouter } from "./routes/completions.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { configRouter } from "./routes/config.js";
import { ensureSeed } from "./seed.js";
import { pool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { tick } from "./worker.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/sites", sitesRouter);
app.use("/work-orders", workOrdersRouter);
app.use("/comments", commentsRouter);
app.use("/completions", completionsRouter);
app.use("/dashboard", dashboardRouter);
app.use("/config", configRouter);

app.use(errorMiddleware);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// On Render's free tier a separate Background Worker is a paid add-on, so the
// notification outbox is polled from inside the web service instead. Set
// RUN_WORKER_IN_PROCESS=false to go back to running `npm run worker` separately.
const RUN_WORKER_IN_PROCESS = process.env.RUN_WORKER_IN_PROCESS !== "false";
const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 5000);

function startInProcessWorker() {
  let running = false;
  setInterval(async () => {
    if (running) return; // skip if the previous pass is still going
    running = true;
    try {
      await tick();
    } catch (e) {
      console.error("[worker] tick failed", e);
    } finally {
      running = false;
    }
  }, WORKER_INTERVAL_MS).unref();
  console.log(`[worker] polling in-process every ${WORKER_INTERVAL_MS}ms`);
}

async function start() {
  await pool.query("SELECT 1;");
  console.log("[server] Running migrations...");
  await runMigrations();
  await ensureSeed();
  if (RUN_WORKER_IN_PROCESS) startInProcessWorker();
  app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
}
start().catch((e) => { console.error(e); process.exit(1); });
