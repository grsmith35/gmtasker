import { db } from "./db/client.js";
import { organizations, sites, users } from "./db/schema.js";
import { hashPassword } from "./lib/auth.js";

export async function ensureSeed() {
  const existing = await db.select().from(organizations).limit(1);
  if (existing.length) return;

  const org = await db.insert(organizations).values({ name: "Demo Org", timezone: "America/Boise" }).returning();
  const orgId = org[0]!.id;

  await db.insert(sites).values({ organizationId: orgId, name: "Demo Airport", address: "123 Runway Rd" });

  const passwordHash = await hashPassword("DemoPass123!");
  await db.insert(users).values({
    organizationId: orgId,
    role: "gm",
    fullName: "Demo GM",
    email: "gm@demo.com",
    phone: "+15555550100",
    passwordHash,
  });

  console.log("[seed] Created Demo Org + site + GM user: gm@demo.com / DemoPass123!");
}
