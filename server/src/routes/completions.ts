import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db/client.js";
import { attachments, notificationOutbox, users, workOrderAssignments, workOrderCompletions, workOrders } from "../db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, AuthedRequest } from "../middleware/authMiddleware.js";
import { HttpError } from "../lib/errors.js";
import { addEvent } from "../lib/events.js";

const upload = multer({ dest: "uploads/" });

export const completionsRouter = Router();
completionsRouter.use(requireAuth);

const submitSchema = z.object({
  hoursWorkedMinutes: z.number().int().min(1),
  completionNotes: z.string().optional().nullable()
});

completionsRouter.post("/:workOrderId/submit", upload.array("photos", 10), async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "contractor") throw new HttpError(403, "Only contractors can submit completion");
    const workOrderId = req.params.workOrderId!;
    const body = submitSchema.parse({
      hoursWorkedMinutes: Number(req.body.hoursWorkedMinutes),
      completionNotes: req.body.completionNotes ?? null
    });

    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    if (wo.organizationId !== req.user!.organizationId) throw new HttpError(403, "Forbidden");

    const a = await db.select().from(workOrderAssignments)
      .where(and(eq(workOrderAssignments.workOrderId, workOrderId), isNull(workOrderAssignments.unassignedAt), eq(workOrderAssignments.assignedToUserId, req.user!.userId)))
      .limit(1);
    if (!a.length) throw new HttpError(403, "Not assigned to you");

    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw new HttpError(400, "At least one completion photo is required");

    const inserted = await db.insert(workOrderCompletions).values({
      workOrderId,
      submittedByUserId: req.user!.userId,
      hoursWorkedMinutes: body.hoursWorkedMinutes,
      completionNotes: body.completionNotes ?? null
    }).returning();

    const completion = inserted[0]!;
    const attRows = [];
    for (const f of files) {
      const url = `/uploads/${f.filename}`;
      const arow = await db.insert(attachments).values({
        workOrderId,
        completionId: completion.id,
        uploadedByUserId: req.user!.userId,
        type: "completion_photo",
        fileUrl: url
      }).returning();
      attRows.push(arow[0]);
    }

    await db.update(workOrders).set({ status: "needs_review", updatedAt: new Date() }).where(eq(workOrders.id, workOrderId));
    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "completion_submitted", message: `${req.user!.fullName} submitted completion (ready for GM review).`, metadata: { completionId: completion.id, hoursWorkedMinutes: body.hoursWorkedMinutes } });

    const gms = await db.select().from(users).where(and(eq(users.organizationId, req.user!.organizationId), eq(users.role, "gm")));
    for (const gm of gms) {
      if (!gm.phone) continue;
      await db.insert(notificationOutbox).values({
        organizationId: req.user!.organizationId,
        workOrderId,
        toPhone: gm.phone,
        template: "completion_submitted",
        payload: { workOrderId, title: wo.title, contractor: req.user!.fullName, link: `${process.env.APP_BASE_URL || ""}/tasks/${workOrderId}` },
        sendAt: new Date()
      });
    }

    res.status(201).json({ completion, attachments: attRows });
  } catch (e) { next(e); }
});

const reviewSchema = z.object({ decision: z.enum(["approve","reject"]), reviewNotes: z.string().optional().nullable() });

completionsRouter.post("/:workOrderId/review/:completionId", async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "gm") throw new HttpError(403, "Only GM can review completion");
    const workOrderId = req.params.workOrderId!;
    const completionId = req.params.completionId!;
    const body = reviewSchema.parse(req.body);

    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    if (wo.organizationId !== req.user!.organizationId) throw new HttpError(403, "Forbidden");

    const completion = (await db.select().from(workOrderCompletions)
      .where(and(eq(workOrderCompletions.id, completionId), eq(workOrderCompletions.workOrderId, workOrderId))).limit(1))[0];
    if (!completion) throw new HttpError(404, "Completion not found");

    const nextStatus = body.decision === "approve" ? "approved" : "rejected";
    const updated = await db.update(workOrderCompletions).set({
      reviewStatus: nextStatus,
      reviewedByUserId: req.user!.userId,
      reviewedAt: new Date(),
      reviewNotes: body.reviewNotes ?? null
    }).where(eq(workOrderCompletions.id, completionId)).returning();

    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "completion_reviewed", message: `${req.user!.fullName} ${body.decision === "approve" ? "approved" : "rejected"} the completion submission.`, metadata: { completionId, decision: body.decision } });

    if (body.decision === "reject") {
      await db.update(workOrders).set({ status: "in_progress", updatedAt: new Date() }).where(eq(workOrders.id, workOrderId));
      const contractor = (await db.select().from(users).where(eq(users.id, completion.submittedByUserId)).limit(1))[0];
      if (contractor?.phone) {
        await db.insert(notificationOutbox).values({
          organizationId: req.user!.organizationId,
          workOrderId,
          toPhone: contractor.phone,
          template: "completion_rejected",
          payload: { workOrderId, title: wo.title, reviewNotes: body.reviewNotes ?? "", link: `${process.env.APP_BASE_URL || ""}/tasks/${workOrderId}` },
          sendAt: new Date()
        });
      }
    }

    res.json(updated[0]);
  } catch (e) { next(e); }
});
