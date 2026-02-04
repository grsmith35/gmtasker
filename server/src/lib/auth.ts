import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError } from "./errors.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

export function signToken(payload: { userId: string; organizationId: string; role: "gm" | "contractor"; fullName: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
export function verifyToken(token: string) {
  try { return jwt.verify(token, JWT_SECRET) as any; }
  catch { throw new HttpError(401, "Invalid token"); }
}
export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}
export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
