import { db } from "../db/client.js";
import { workOrderEvents } from "../db/schema.js";

export async function addEvent(args: {
  workOrderId: string;
  actorUserId: string;
  type: typeof workOrderEvents.$inferInsert["type"];
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(workOrderEvents).values({
    workOrderId: args.workOrderId,
    actorUserId: args.actorUserId,
    type: args.type,
    message: args.message,
    metadata: args.metadata ?? {},
  });
}
