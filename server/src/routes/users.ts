import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/authMiddleware.js";
import { HttpError } from "../lib/errors.js";
import { hashPassword } from "../lib/auth.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("gm"));

const createSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["contractor","gm"]).default("contractor"),
  password: z.string().min(8),
});
const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(["contractor","gm"]).optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "No fields to update",
});

usersRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const rows = await db.select({
      id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, role: users.role, isActive: users.isActive
    }).from(users).where(eq(users.organizationId, req.user!.organizationId));
    res.json(rows);
  } catch (e) { next(e); }
});

usersRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const inserted = await db.insert(users).values({
      organizationId: req.user!.organizationId,
      role: body.role,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      passwordHash,
    }).returning({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, role: users.role });
    res.status(201).json(inserted[0]);
  } catch (e: any) {
    if (String(e?.message || "").includes("users_email_unique")) next(new HttpError(400, "Email already exists"));
    else next(e);
  }
});

usersRouter.patch("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.params.id;
    const body = updateSchema.parse(req.body);

    if (userId === req.user!.userId && body.isActive === false) {
      throw new HttpError(400, "You cannot deactivate your own account");
    }

    const existing = await db.select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, req.user!.organizationId)))
      .limit(1);
    if (!existing[0]) throw new HttpError(404, "User not found");

    const updateData: Partial<typeof users.$inferInsert> = {};
    if (body.fullName !== undefined) updateData.fullName = body.fullName;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.password) updateData.passwordHash = await hashPassword(body.password);

    const updated = await db.update(users)
      .set(updateData)
      .where(and(eq(users.id, userId), eq(users.organizationId, req.user!.organizationId)))
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
      });
    res.json(updated[0]);
  } catch (e: any) {
    if (String(e?.message || "").includes("users_email_unique")) next(new HttpError(400, "Email already exists"));
    else next(e);
  }
});

usersRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.params.id;
    if (userId === req.user!.userId) throw new HttpError(400, "You cannot delete your own account");

    const existing = await db.select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, req.user!.organizationId)))
      .limit(1);
    if (!existing[0]) throw new HttpError(404, "User not found");

    await db.delete(users).where(and(eq(users.id, userId), eq(users.organizationId, req.user!.organizationId)));
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "23503") next(new HttpError(400, "User cannot be deleted because they are referenced by work order data"));
    else next(e);
  }
});
