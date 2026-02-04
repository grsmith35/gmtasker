import { Router } from "express";
import { db } from "../db/client.js";
import { sites } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth, AuthedRequest } from "../middleware/authMiddleware.js";

export const sitesRouter = Router();
sitesRouter.use(requireAuth);

sitesRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const rows = await db.select().from(sites).where(eq(sites.organizationId, req.user!.organizationId));
    res.json(rows);
  } catch (e) { next(e); }
});
