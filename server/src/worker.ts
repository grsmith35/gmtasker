import "dotenv/config";
import { db } from "./db/client.js";
import { notificationOutbox } from "./db/schema.js";
import { and, eq, lte, asc } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { sendSms } from "./lib/sms.js";

function renderTemplate(tpl: string, payload: any) {
  const link = payload.link ? `\n${payload.link}` : "";
  switch (tpl) {
    case "assigned":
      return `New task assigned: ${payload.title}${link}`;
    case "completion_submitted":
      return `Task completed and ready for review: ${payload.title} (by ${payload.contractor})${link}`;
    case "completion_rejected":
      return `Completion needs changes: ${payload.title}\nNotes: ${payload.reviewNotes || ""}${link}`;
    case "closed":
      return `Work order closed: ${payload.title}${link}`;
    default:
      return `Notification${link}`;
  }
}

export async function tick() {
  const now = new Date();
  const pending = await db.select().from(notificationOutbox)
    .where(and(eq(notificationOutbox.status, "pending"), lte(notificationOutbox.sendAt, now)))
    .orderBy(asc(notificationOutbox.sendAt))
    .limit(25);

  for (const n of pending) {
    try {
      const body = renderTemplate(n.template, n.payload);
      const result = await sendSms(n.toPhone, body);
      await db.update(notificationOutbox).set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
        error: null
      }).where(eq(notificationOutbox.id, n.id));
    } catch (e: any) {
      await db.update(notificationOutbox).set({
        status: "failed",
        error: String(e?.message || e)
      }).where(eq(notificationOutbox.id, n.id));
    }
  }
}

async function main() {
  console.log("[worker] started");
  while (true) {
    await tick();
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Only loop when run as its own process (`npm run worker`). When the server
// imports tick() for the in-process poller, this must not start a second loop.
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
