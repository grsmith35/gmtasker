import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { comments, workOrders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth, AuthedRequest } from "../middleware/authMiddleware.js";
import { HttpError } from "../lib/errors.js";
import { addEvent } from "../lib/events.js";

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

const createSchema = z.object({ message: z.string().min(1) });

commentsRouter.post("/:workOrderId", async (req: AuthedRequest, res, next) => {
  try {
    const workOrderId = req.params.workOrderId!;
    const body = createSchema.parse(req.body);

    const wo = (await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1))[0];
    if (!wo) throw new HttpError(404, "Not found");
    if (wo.organizationId !== req.user!.organizationId) throw new HttpError(403, "Forbidden");

    const inserted = await db.insert(comments).values({
      workOrderId,
      userId: req.user!.userId,
      message: body.message,
    }).returning();

    await addEvent({ workOrderId, actorUserId: req.user!.userId, type: "comment_added", message: `${req.user!.fullName} commented.` });

    res.status(201).json(inserted[0]);
  } catch (e) { next(e); }
});
