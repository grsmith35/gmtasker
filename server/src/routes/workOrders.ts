import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { workOrders, workOrderAssignments, workOrderParts, users, comments, workOrderEvents, workOrderCompletions, attachments, notificationOutbox } from "../db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { requireAuth, AuthedRequest } from "../middleware/authMiddleware.js";
import { HttpError } from "../lib/errors.js";
import { addEvent } from "../lib/events.js";

export const workOrdersRouter = Router();
workOrdersRouter.use(requireAuth);

const createSchema = z.object({
  siteId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["emergency","high","normal","low"]).default("normal"),
  dueAt: z.string().datetime().optional().nullable(),
});

const updateSchema = z.object({
  priority: z.enum(["emergency","high","normal","low"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  status: z.enum(["open","in_progress","on_hold","needs_review","closed"]).optional(),
  onHoldReason: z.enum(["awaiting_parts","awaiting_approval","awaiting_access","awaiting_vendor","other"]).optional().nullable(),
  onHoldNotes: z.string().optional().nullable(),
});

function assertOrg(req: AuthedRequest, orgId: string) {
  if (req.user!.organizationId !== orgId) throw new HttpError(403, "Forbidden");
}

workOrdersRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const mine = req.query.mine === "1";
    const orgId = req.user!.organizationId;

    if (mine) {
      const rows = await db.execute(sql`
        SELECT wo.*
        FROM work_orders wo
        JOIN work_order_assignments a ON a.work_order_id = wo.id AND a.unassigned_at IS NULL
        WHERE wo.organization_id = ${orgId}
          AND a.assigned_to_user_id = ${req.user!.userId}
          ${status ? sql`AND wo.status = ${status}` : sql``}
        ORDER BY wo.updated_at DESC;
      `);
      res.json(rows.rows);
      return;
    }

    const where = status ? and(eq(workOrders.organizationId, orgId), eq(workOrders.status, status as any)) : eq(workOrders.organizationId, orgId);
    const rows = await db.select().from(workOrders).where(where).orderBy(desc(workOrders.updatedAt));
    res.json(rows);
  } catch (e) { next(e); }
});

workOrdersRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "gm") throw new HttpError(403, "Only GM can create work orders");
    const body = createSchema.parse(req.body);

    const inserted = await db.insert(workOrders).values({
      organizationId: req.user!.organizationId,
      siteId: body.siteId,
      locationId: body.locationId ?? null,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      createdByUserId: req.user!.userId,
    }).returning();

    const wo = inserted[0]!;
    await addEvent({ workOrderId: wo.id, actorUserId: req.user!.userId, type: "work_order_created", message: `${req.user!.fullName} created this work order.`, metadata: { title: wo.title, priority: wo.priority } });
    res.status(201).json(wo);
  } catch (e) { next(e); }
});

workOrdersRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const id = req.params.id!;
    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    assertOrg(req, wo.organizationId);

    if (req.user!.role === "contractor") {
      const a = await db.select().from(workOrderAssignments)
        .where(and(eq(workOrderAssignments.workOrderId, id), isNull(workOrderAssignments.unassignedAt), eq(workOrderAssignments.assignedToUserId, req.user!.userId)))
        .limit(1);
      if (!a.length) throw new HttpError(403, "Not assigned to you");
    }

    const parts = await db.select().from(workOrderParts).where(eq(workOrderParts.workOrderId, id)).orderBy(desc(workOrderParts.createdAt));
    const comms = await db.select({
      id: comments.id, message: comments.message, createdAt: comments.createdAt,
      userId: comments.userId, userName: users.fullName
    }).from(comments).innerJoin(users, eq(users.id, comments.userId))
      .where(eq(comments.workOrderId, id)).orderBy(desc(comments.createdAt));

    const events = await db.select({
      id: workOrderEvents.id, type: workOrderEvents.type, message: workOrderEvents.message,
      createdAt: workOrderEvents.createdAt, actorName: users.fullName, metadata: workOrderEvents.metadata
    }).from(workOrderEvents).innerJoin(users, eq(users.id, workOrderEvents.actorUserId))
      .where(eq(workOrderEvents.workOrderId, id)).orderBy(desc(workOrderEvents.createdAt));

    const completions = await db.select({
      id: workOrderCompletions.id,
      submittedAt: workOrderCompletions.submittedAt,
      hoursWorkedMinutes: workOrderCompletions.hoursWorkedMinutes,
      completionNotes: workOrderCompletions.completionNotes,
      reviewStatus: workOrderCompletions.reviewStatus,
      reviewNotes: workOrderCompletions.reviewNotes,
      submittedByName: users.fullName
    }).from(workOrderCompletions)
      .innerJoin(users, eq(users.id, workOrderCompletions.submittedByUserId))
      .where(eq(workOrderCompletions.workOrderId, id))
      .orderBy(desc(workOrderCompletions.submittedAt));

    const att = await db.select().from(attachments).where(eq(attachments.workOrderId, id)).orderBy(desc(attachments.createdAt));
    const activeAssignment = (await db.select({
      id: workOrderAssignments.id,
      assignedToUserId: workOrderAssignments.assignedToUserId,
      assignedToName: users.fullName,
      assignedAt: workOrderAssignments.assignedAt,
      forceAssigned: workOrderAssignments.forceAssigned,
    }).from(workOrderAssignments)
      .innerJoin(users, eq(users.id, workOrderAssignments.assignedToUserId))
      .where(and(eq(workOrderAssignments.workOrderId, id), isNull(workOrderAssignments.unassignedAt)))
      .limit(1))[0] ?? null;

    res.json({ workOrder: wo, parts, comments: comms, events, completions, attachments: att, assignment: activeAssignment });
  } catch (e) { next(e); }
});

workOrdersRouter.patch("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const id = req.params.id!;
    const body = updateSchema.parse(req.body);

    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    assertOrg(req, wo.organizationId);

    // Contractors can only set open/in_progress/on_hold signals; cannot set needs_review/closed
    if (req.user!.role === "contractor") {
      if (body.status && (body.status === "needs_review" || body.status === "closed")) throw new HttpError(403, "Forbidden status");
      if (body.priority || body.dueAt) throw new HttpError(403, "Contractor cannot edit priority/due");
    }

    const updates: any = { updatedAt: new Date() };
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueAt !== undefined) updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.onHoldReason !== undefined) updates.onHoldReason = body.onHoldReason;
    if (body.onHoldNotes !== undefined) updates.onHoldNotes = body.onHoldNotes;

    const statusChanged = body.status !== undefined && body.status !== wo.status;
    const holdChanged = (body.onHoldReason !== undefined && body.onHoldReason !== wo.onHoldReason) ||
                        (body.onHoldNotes !== undefined && body.onHoldNotes !== wo.onHoldNotes);

    const updated = await db.update(workOrders).set(updates).where(eq(workOrders.id, id)).returning();
    const nextWo = updated[0]!;

    if (statusChanged) await addEvent({ workOrderId: id, actorUserId: req.user!.userId, type: "status_changed", message: `${req.user!.fullName} set status to ${nextWo.status}.`, metadata: { from: wo.status, to: nextWo.status } });
    if (holdChanged) await addEvent({ workOrderId: id, actorUserId: req.user!.userId, type: "hold_changed", message: `${req.user!.fullName} updated hold info.`, metadata: { onHoldReason: nextWo.onHoldReason, onHoldNotes: nextWo.onHoldNotes } });
    if (!statusChanged && !holdChanged) await addEvent({ workOrderId: id, actorUserId: req.user!.userId, type: "work_order_updated", message: `${req.user!.fullName} updated task details.` });

    res.json(nextWo);
  } catch (e) { next(e); }
});

// Parts
const partCreateSchema = z.object({ name: z.string().min(1), quantity: z.number().int().min(1).default(1), isRequired: z.boolean().optional().default(true) });
const partUpdateSchema = z.object({
  approvalStatus: z.enum(["not_requested","pending_approval","approved","rejected"]).optional(),
  procurementStatus: z.enum(["not_started","quoted","ordered","arrived","backordered","cancelled"]).optional(),
  quotedTotalCostCents: z.number().int().nonnegative().optional().nullable(),
  actualTotalCostCents: z.number().int().nonnegative().optional().nullable()
});

workOrdersRouter.post("/:id/parts", async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "gm") throw new HttpError(403, "Only GM can add parts");
    const workOrderId = req.params.id!;
    const body = partCreateSchema.parse(req.body);
    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    assertOrg(req, wo.organizationId);

    const inserted = await db.insert(workOrderParts).values({ workOrderId, name: body.name, quantity: body.quantity, isRequired: body.isRequired ?? true }).returning();
    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "part_created", message: `${req.user!.fullName} added part "${body.name}".`, metadata: { partId: inserted[0]!.id } });
    res.status(201).json(inserted[0]);
  } catch (e) { next(e); }
});

workOrdersRouter.patch("/:id/parts/:partId", async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "gm") throw new HttpError(403, "Only GM can update parts");
    const workOrderId = req.params.id!;
    const partId = req.params.partId!;
    const body = partUpdateSchema.parse(req.body);

    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    assertOrg(req, wo.organizationId);

    const updates: any = { updatedAt: new Date() };
    if (body.approvalStatus !== undefined) updates.approvalStatus = body.approvalStatus;
    if (body.procurementStatus !== undefined) updates.procurementStatus = body.procurementStatus;
    if (body.quotedTotalCostCents !== undefined) updates.quotedTotalCostCents = body.quotedTotalCostCents;
    if (body.actualTotalCostCents !== undefined) updates.actualTotalCostCents = body.actualTotalCostCents;

    if (body.procurementStatus === "quoted") updates.quotedAt = new Date();
    if (body.procurementStatus === "ordered") updates.orderedAt = new Date();
    if (body.procurementStatus === "arrived") updates.arrivedAt = new Date();

    const updated = await db.update(workOrderParts).set(updates).where(eq(workOrderParts.id, partId)).returning();
    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "part_updated", message: `${req.user!.fullName} updated a part.`, metadata: { partId, changes: body } });
    res.json(updated[0]);
  } catch (e) { next(e); }
});

// Assign (blocked by parts unless force)
const assignSchema = z.object({ assignedToUserId: z.string().uuid(), force: z.boolean().optional().default(false) });

workOrdersRouter.post("/:id/assign", async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "gm") throw new HttpError(403, "Only GM can assign");
    const workOrderId = req.params.id!;
    const body = assignSchema.parse(req.body);

    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    assertOrg(req, wo.organizationId);

    const assignee = (await db.select().from(users).where(eq(users.id, body.assignedToUserId)).limit(1))[0];
    if (!assignee || assignee.role !== "contractor") throw new HttpError(400, "Assignee must be contractor");

    if (!body.force) {
      const parts = await db.select().from(workOrderParts).where(eq(workOrderParts.workOrderId, workOrderId));
      const blocking = parts.filter(p => p.isRequired && !(p.approvalStatus === "approved" && p.procurementStatus === "arrived"));
      if (blocking.length) throw new HttpError(400, "Cannot assign until all required parts are approved and arrived", { blockingParts: blocking });
    }

    await db.update(workOrderAssignments).set({ unassignedAt: new Date() })
      .where(and(eq(workOrderAssignments.workOrderId, workOrderId), isNull(workOrderAssignments.unassignedAt)));

    const inserted = await db.insert(workOrderAssignments).values({
      workOrderId,
      assignedToUserId: body.assignedToUserId,
      assignedByUserId: req.user!.userId,
      forceAssigned: body.force ?? false
    }).returning();

    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "assignment_created", message: `${req.user!.fullName} assigned this work order to ${assignee.fullName}.`, metadata: { assignedToUserId: assignee.id, force: body.force ?? false } });

    if (assignee.phone) {
      await db.insert(notificationOutbox).values({
        organizationId: req.user!.organizationId,
        workOrderId,
        toPhone: assignee.phone,
        template: "assigned",
        payload: { workOrderId, title: wo.title, link: `${process.env.APP_BASE_URL || ""}/tasks/${workOrderId}` },
        sendAt: new Date()
      });
    }

    res.status(201).json(inserted[0]);
  } catch (e) { next(e); }
});

workOrdersRouter.post("/:id/close", async (req: AuthedRequest, res, next) => {
  try {
    if (req.user!.role !== "gm") throw new HttpError(403, "Only GM can close");
    const workOrderId = req.params.id!;
    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    assertOrg(req, wo.organizationId);

    const updated = await db.update(workOrders).set({ status: "closed", closedAt: new Date(), closedByUserId: req.user!.userId, updatedAt: new Date() })
      .where(eq(workOrders.id, workOrderId)).returning();

    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "work_order_closed", message: `${req.user!.fullName} closed this work order.` });

    res.json(updated[0]);
  } catch (e) { next(e); }
});
