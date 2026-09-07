import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

// Render's *internal* database URL speaks plaintext inside their network, while
// external URLs (Render external, Neon, Supabase) require TLS and present a
// certificate Node won't verify against the system roots. PGSSLMODE=require
// turns TLS on; set PGSSL_REJECT_UNAUTHORIZED=true if you supply a real CA.
const sslMode = (process.env.PGSSLMODE || "").toLowerCase();
const wantsSsl = sslMode === "require" || sslMode === "prefer" || process.env.DATABASE_SSL === "true";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: wantsSsl
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === "true" }
    : undefined
});
export const db = drizzle(pool, { schema });
