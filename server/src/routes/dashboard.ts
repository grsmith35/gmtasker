import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/authMiddleware.js";
import { HttpError } from "../lib/errors.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRole("gm"));

function parseDate(value: unknown, fallback: Date) {
  if (!value) return fallback;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid date format");
  return d;
}

function getRange(req: AuthedRequest) {
  const now = new Date();
  const from = parseDate(req.query.from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const to = parseDate(req.query.to, now);
  if (from > to) throw new HttpError(400, "Invalid date range");
  return { from, to };
}

function siteFilter(siteId?: string) {
  if (!siteId) return sql``;
  return sql`AND wo.site_id = ${siteId}`;
}

function siteFilterAlias(siteId?: string, alias = "wo") {
  if (!siteId) return sql``;
  return sql`AND ${sql.raw(alias)}.site_id = ${siteId}`;
}

dashboardRouter.get("/contractors", async (req: AuthedRequest, res, next) => {
  try {
    const orgId = req.user!.organizationId;
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined;
    const { from, to } = getRange(req);

    const rows = await db.execute(sql`
      WITH contractors AS (
        SELECT id, full_name, email, phone
        FROM users
        WHERE organization_id = ${orgId} AND role = 'contractor'
      ),
      active_assignments AS (
        SELECT a.assigned_to_user_id AS contractor_id,
               wo.id AS work_order_id,
               wo.status,
               wo.due_at,
               wo.priority
        FROM work_order_assignments a
        JOIN work_orders wo ON wo.id = a.work_order_id
        WHERE a.unassigned_at IS NULL
          AND wo.organization_id = ${orgId}
          ${siteFilterAlias(siteId)}
      ),
      active_agg AS (
        SELECT contractor_id,
          COUNT(*) FILTER (WHERE status <> 'closed') AS open_count,
          COUNT(*) FILTER (WHERE status = 'needs_review') AS needs_review_count,
          COUNT(*) FILTER (WHERE status = 'on_hold') AS on_hold_count,
          COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW() AND status <> 'closed') AS overdue_count,
          COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW() AND status <> 'closed' AND priority IN ('emergency','high')) AS overdue_priority_count
        FROM active_assignments
        GROUP BY contractor_id
      ),
      closed_assignments AS (
        SELECT a.assigned_to_user_id AS contractor_id, wo.id, wo.closed_at
        FROM work_order_assignments a
        JOIN work_orders wo ON wo.id = a.work_order_id
        WHERE wo.organization_id = ${orgId}
          AND wo.closed_at IS NOT NULL
          AND wo.closed_at >= ${from} AND wo.closed_at <= ${to}
          AND a.assigned_at <= wo.closed_at
          AND (a.unassigned_at IS NULL OR a.unassigned_at >= wo.closed_at)
          ${siteFilterAlias(siteId)}
      ),
      closed_agg AS (
        SELECT contractor_id, COUNT(*) AS closed_range_count
        FROM closed_assignments
        GROUP BY contractor_id
      ),
      hours_agg AS (
        SELECT c.submitted_by_user_id AS contractor_id,
               SUM(c.hours_worked_minutes)::INT AS minutes
        FROM work_order_completions c
        JOIN work_orders wo ON wo.id = c.work_order_id
        WHERE wo.organization_id = ${orgId}
          AND c.submitted_at >= ${from} AND c.submitted_at <= ${to}
          ${siteFilterAlias(siteId)}
        GROUP BY c.submitted_by_user_id
      ),
      activity_assignment AS (
        SELECT a.assigned_to_user_id AS contractor_id, MAX(a.assigned_at) AS last_assigned_at
        FROM work_order_assignments a
        JOIN work_orders wo ON wo.id = a.work_order_id
        WHERE wo.organization_id = ${orgId}
          ${siteFilterAlias(siteId)}
        GROUP BY a.assigned_to_user_id
      ),
      activity_comments AS (
        SELECT c.user_id AS contractor_id, MAX(c.created_at) AS last_comment_at
        FROM comments c
        JOIN work_orders wo ON wo.id = c.work_order_id
        WHERE wo.organization_id = ${orgId}
          ${siteFilterAlias(siteId)}
        GROUP BY c.user_id
      ),
      activity_completions AS (
        SELECT c.submitted_by_user_id AS contractor_id, MAX(c.submitted_at) AS last_completion_at
        FROM work_order_completions c
        JOIN work_orders wo ON wo.id = c.work_order_id
        WHERE wo.organization_id = ${orgId}
          ${siteFilterAlias(siteId)}
        GROUP BY c.submitted_by_user_id
      ),
      activity_status AS (
        SELECT e.actor_user_id AS contractor_id, MAX(e.created_at) AS last_status_at
        FROM work_order_events e
        JOIN work_orders wo ON wo.id = e.work_order_id
        WHERE wo.organization_id = ${orgId}
          AND e.type = 'status_changed'
          ${siteFilterAlias(siteId)}
        GROUP BY e.actor_user_id
      )
      SELECT c.id, c.full_name, c.email, c.phone,
        COALESCE(a.open_count, 0) AS open_count,
        COALESCE(a.needs_review_count, 0) AS needs_review_count,
        COALESCE(a.on_hold_count, 0) AS on_hold_count,
        COALESCE(cl.closed_range_count, 0) AS closed_range_count,
        COALESCE(a.overdue_count, 0) AS overdue_count,
        COALESCE(a.overdue_priority_count, 0) AS overdue_priority_count,
        COALESCE(h.minutes, 0) AS hours_minutes,
        NULLIF(GREATEST(
          COALESCE(aa.last_assigned_at, 'epoch'::timestamptz),
          COALESCE(ac.last_comment_at, 'epoch'::timestamptz),
          COALESCE(aco.last_completion_at, 'epoch'::timestamptz),
          COALESCE(ast.last_status_at, 'epoch'::timestamptz)
        ), 'epoch'::timestamptz) AS last_activity_at
      FROM contractors c
      LEFT JOIN active_agg a ON a.contractor_id = c.id
      LEFT JOIN closed_agg cl ON cl.contractor_id = c.id
      LEFT JOIN hours_agg h ON h.contractor_id = c.id
      LEFT JOIN activity_assignment aa ON aa.contractor_id = c.id
      LEFT JOIN activity_comments ac ON ac.contractor_id = c.id
      LEFT JOIN activity_completions aco ON aco.contractor_id = c.id
      LEFT JOIN activity_status ast ON ast.contractor_id = c.id
      ORDER BY c.full_name;
    `);

    const kpis = await db.execute(sql`
      WITH active_assignments AS (
        SELECT wo.status, wo.due_at, wo.priority
        FROM work_order_assignments a
        JOIN work_orders wo ON wo.id = a.work_order_id
        WHERE a.unassigned_at IS NULL
          AND wo.organization_id = ${orgId}
          ${siteFilterAlias(siteId)}
      ),
      closed_assignments AS (
        SELECT wo.id
        FROM work_order_assignments a
        JOIN work_orders wo ON wo.id = a.work_order_id
        WHERE wo.organization_id = ${orgId}
          AND wo.closed_at IS NOT NULL
          AND wo.closed_at >= ${from} AND wo.closed_at <= ${to}
          AND a.assigned_at <= wo.closed_at
          AND (a.unassigned_at IS NULL OR a.unassigned_at >= wo.closed_at)
          ${siteFilterAlias(siteId)}
      ),
      hours_agg AS (
        SELECT SUM(c.hours_worked_minutes)::INT AS minutes
        FROM work_order_completions c
        JOIN work_orders wo ON wo.id = c.work_order_id
        WHERE wo.organization_id = ${orgId}
          AND c.submitted_at >= ${from} AND c.submitted_at <= ${to}
          ${siteFilterAlias(siteId)}
      )
      SELECT
        (SELECT COUNT(*) FROM active_assignments WHERE status <> 'closed') AS open_count,
        (SELECT COUNT(*) FROM active_assignments WHERE due_at IS NOT NULL AND due_at < NOW() AND status <> 'closed') AS overdue_count,
        (SELECT COUNT(*) FROM active_assignments WHERE due_at IS NOT NULL AND due_at < NOW() AND status <> 'closed' AND priority IN ('emergency','high')) AS overdue_priority_count,
        (SELECT COUNT(*) FROM closed_assignments) AS closed_range_count,
        (SELECT COALESCE(minutes, 0) FROM hours_agg) AS hours_minutes;
    `);

    res.json({
      kpis: kpis.rows[0],
      rows: rows.rows,
      range: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (e) { next(e); }
});

dashboardRouter.get("/contractors/:contractorId", async (req: AuthedRequest, res, next) => {
  try {
    const orgId = req.user!.organizationId;
    const contractorId = String(req.params.contractorId);
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined;
    const { from, to } = getRange(req);

    const contractor = await db.execute(sql`
      SELECT id, full_name, email, phone
      FROM users
      WHERE organization_id = ${orgId} AND role = 'contractor' AND id = ${contractorId}
      LIMIT 1;
    `);
    if (!contractor.rows[0]) throw new HttpError(404, "Contractor not found");

    const openTasks = await db.execute(sql`
      SELECT wo.id, wo.title, wo.priority, wo.status, wo.due_at
      FROM work_order_assignments a
      JOIN work_orders wo ON wo.id = a.work_order_id
      WHERE a.unassigned_at IS NULL
        AND a.assigned_to_user_id = ${contractorId}
        AND wo.organization_id = ${orgId}
        AND wo.status <> 'closed'
        AND wo.status <> 'needs_review'
        ${siteFilterAlias(siteId)}
      ORDER BY wo.due_at NULLS LAST;
    `);

    const needsReview = await db.execute(sql`
      SELECT wo.id, wo.title, wo.priority, wo.status, wo.due_at
      FROM work_order_assignments a
      JOIN work_orders wo ON wo.id = a.work_order_id
      WHERE a.unassigned_at IS NULL
        AND a.assigned_to_user_id = ${contractorId}
        AND wo.organization_id = ${orgId}
        AND wo.status = 'needs_review'
        ${siteFilterAlias(siteId)}
      ORDER BY wo.updated_at DESC;
    `);

    const completed = await db.execute(sql`
      SELECT wo.id, wo.title, wo.closed_at, wo.priority,
             comp.hours_worked_minutes, comp.completion_notes, comp.submitted_at
      FROM work_orders wo
      JOIN work_order_assignments a ON a.work_order_id = wo.id
      LEFT JOIN LATERAL (
        SELECT hours_worked_minutes, completion_notes, submitted_at
        FROM work_order_completions c
        WHERE c.work_order_id = wo.id
        ORDER BY submitted_at DESC
        LIMIT 1
      ) comp ON true
      WHERE wo.organization_id = ${orgId}
        AND wo.closed_at IS NOT NULL
        AND wo.closed_at >= ${from} AND wo.closed_at <= ${to}
        AND a.assigned_to_user_id = ${contractorId}
        AND a.assigned_at <= wo.closed_at
        AND (a.unassigned_at IS NULL OR a.unassigned_at >= wo.closed_at)
        ${siteFilterAlias(siteId)}
      ORDER BY wo.closed_at DESC;
    `);

    res.json({
      contractor: contractor.rows[0],
      range: { from: from.toISOString(), to: to.toISOString() },
      openTasks: openTasks.rows,
      needsReview: needsReview.rows,
      completed: completed.rows,
    });
  } catch (e) { next(e); }
});
