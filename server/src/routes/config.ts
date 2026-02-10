import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/authMiddleware.js";
import { HttpError } from "../lib/errors.js";
import { db } from "../db/client.js";
import { emailConfigs } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

export const configRouter = Router();
configRouter.use(requireAuth, requireRole("gm"));

const upsertSchema = z.object({
  gmailAddress: z.string().email(),
  appPassword: z.string().min(8),
  fromName: z.string().optional().nullable(),
  replyTo: z.string().email().optional().nullable(),
});

const testSchema = z.object({
  gmailAddress: z.string().email().optional(),
  appPassword: z.string().min(8).optional(),
  fromName: z.string().optional().nullable(),
  replyTo: z.string().email().optional().nullable(),
  testTo: z.string().email(),
});

const PROVIDER = "gmail";

configRouter.get("/email", async (req: AuthedRequest, res, next) => {
  try {
    const row = await db.select().from(emailConfigs)
      .where(and(eq(emailConfigs.organizationId, req.user!.organizationId), eq(emailConfigs.provider, PROVIDER)))
      .limit(1);
    if (!row[0]) {
      res.json({ provider: PROVIDER, configured: false });
      return;
    }
    res.json({
      provider: PROVIDER,
      configured: true,
      gmailAddress: row[0].gmailAddress,
      fromName: row[0].fromName,
      replyTo: row[0].replyTo,
      hasAppPassword: true,
      updatedAt: row[0].updatedAt,
    });
  } catch (e) { next(e); }
});

configRouter.put("/email", async (req: AuthedRequest, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const enc = encryptSecret(body.appPassword);
    const existing = await db.select({ id: emailConfigs.id }).from(emailConfigs)
      .where(and(eq(emailConfigs.organizationId, req.user!.organizationId), eq(emailConfigs.provider, PROVIDER)))
      .limit(1);

    if (existing[0]) {
      await db.update(emailConfigs).set({
        gmailAddress: body.gmailAddress,
        appPasswordEnc: enc,
        fromName: body.fromName ?? null,
        replyTo: body.replyTo ?? null,
        updatedAt: new Date(),
      }).where(eq(emailConfigs.id, existing[0].id));
    } else {
      await db.insert(emailConfigs).values({
        organizationId: req.user!.organizationId,
        provider: PROVIDER,
        gmailAddress: body.gmailAddress,
        appPasswordEnc: enc,
        fromName: body.fromName ?? null,
        replyTo: body.replyTo ?? null,
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

configRouter.post("/email/test", async (req: AuthedRequest, res, next) => {
  try {
    const body = testSchema.parse(req.body);

    let gmailAddress = body.gmailAddress;
    let appPassword = body.appPassword;
    let fromName = body.fromName ?? null;
    let replyTo = body.replyTo ?? null;

    if (!gmailAddress || !appPassword) {
      const row = await db.select().from(emailConfigs)
        .where(and(eq(emailConfigs.organizationId, req.user!.organizationId), eq(emailConfigs.provider, PROVIDER)))
        .limit(1);
      if (!row[0]) throw new HttpError(400, "No saved Gmail configuration");
      gmailAddress = gmailAddress || row[0].gmailAddress;
      appPassword = appPassword || decryptSecret(row[0].appPasswordEnc);
      fromName = fromName ?? row[0].fromName;
      replyTo = replyTo ?? row[0].replyTo;
    }

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailAddress,
        pass: appPassword,
      },
    });

    const from = fromName ? `${fromName} <${gmailAddress}>` : gmailAddress!;

    await transport.sendMail({
      from,
      to: body.testTo,
      subject: "Work Orders email test",
      text: "This is a test email from your Work Orders configuration.",
      replyTo: replyTo || undefined,
    });

    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "EAUTH" || String(e?.message || "").includes("Invalid login")) {
      next(new HttpError(400, "Gmail authentication failed. Check the email/app password."));
      return;
    }
    next(e);
  }
});
