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
import { ensureSeed } from "./seed.js";
import { pool } from "./db/client.js";

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

app.use(errorMiddleware);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

async function start() {
  await pool.query("SELECT 1;");
  // ensure schema exists
  // (docker runs with empty DB; run migrations automatically here)
  // We'll run the migration tool via code for convenience if __migrations missing.
  try {
    await pool.query("SELECT 1 FROM __migrations LIMIT 1;");
  } catch {
    console.log("[server] Running migrations...");
    // lightweight: shelling out isn't ideal; instead just import migrate file.
    await import("./db/migrate.js");
  }
  await ensureSeed();
  app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
}
start().catch((e) => { console.error(e); process.exit(1); });
