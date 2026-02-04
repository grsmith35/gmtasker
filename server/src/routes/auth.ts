import { Router } from "express";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { HttpError } from "../lib/errors.js";
import { loginSchema, signToken, verifyPassword } from "../lib/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const rows = await db.select().from(users).where(eq(users.email, parsed.email)).limit(1);
    const user = rows[0];
    if (!user || !user.isActive) throw new HttpError(401, "Invalid credentials");
    const ok = await verifyPassword(parsed.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    const token = signToken({ userId: user.id, organizationId: user.organizationId, role: user.role, fullName: user.fullName });
    res.json({ token, user: { id: user.id, role: user.role, fullName: user.fullName, email: user.email } });
  } catch (e) { next(e); }
});
