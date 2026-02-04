import "dotenv/config";
import { pool } from "./client.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ...
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// When compiled, this file is dist/db/migrate.js
// So migrations should be in dist/db/migrations after build
const dir = join(__dirname, "migrations");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        id TEXT PRIMARY KEY,
        ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // When compiled, this file is dist/db/migrate.js
    // So migrations should be in dist/db/migrations after build
    const dir = join(__dirname, "migrations");
    const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

    for (const file of files) {
      const already = await client.query("SELECT 1 FROM __migrations WHERE id=$1", [file]);
      if (already.rowCount) continue;
      const sql = readFileSync(join(dir, file), "utf-8");
      await client.query(sql);
      await client.query("INSERT INTO __migrations(id) VALUES ($1)", [file]);
      console.log("Migrated:", file);
    }

    await client.query("COMMIT");
    console.log("Migrations complete.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main();
