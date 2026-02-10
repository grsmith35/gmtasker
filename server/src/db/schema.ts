import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum, uniqueIndex, AnyPgColumn } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["gm", "contractor"]);
export const workOrderStatusEnum = pgEnum("work_order_status", ["open", "in_progress", "on_hold", "needs_review", "closed"]);
export const holdReasonEnum = pgEnum("hold_reason", ["awaiting_parts", "awaiting_approval", "awaiting_access", "awaiting_vendor", "other"]);
export const partApprovalStatusEnum = pgEnum("part_approval_status", ["not_requested", "pending_approval", "approved", "rejected"]);
export const partProcurementStatusEnum = pgEnum("part_procurement_status", ["not_started", "quoted", "ordered", "arrived", "backordered", "cancelled"]);
export const attachmentTypeEnum = pgEnum("attachment_type", ["issue_photo", "completion_photo", "other"]);
export const completionReviewStatusEnum = pgEnum("completion_review_status", ["submitted", "approved", "rejected"]);
export const eventTypeEnum = pgEnum("event_type", [
  "work_order_created","work_order_updated","status_changed","hold_changed",
  "assignment_created","assignment_removed","part_created","part_updated",
  "comment_added","completion_submitted","completion_reviewed","work_order_closed"
]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending","sent","failed"]);
export const notificationTemplateEnum = pgEnum("notification_template", ["assigned","completion_submitted","completion_rejected","closed"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Boise"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  parentLocationId: uuid("parent_location_id").references((): AnyPgColumn => locations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
}));

export const workOrders = pgTable("work_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("normal"),
  status: workOrderStatusEnum("status").notNull().default("open"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  onHoldReason: holdReasonEnum("on_hold_reason"),
  onHoldNotes: text("on_hold_notes"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

export const workOrderAssignments = pgTable("work_order_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  assignedToUserId: uuid("assigned_to_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedByUserId: uuid("assigned_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
  forceAssigned: boolean("force_assigned").notNull().default(false),
});

export const workOrderParts = pgTable("work_order_parts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  vendor: text("vendor"),
  skuOrLink: text("sku_or_link"),
  notes: text("notes"),
  isRequired: boolean("is_required").notNull().default(true),
  approvalStatus: partApprovalStatusEnum("approval_status").notNull().default("not_requested"),
  procurementStatus: partProcurementStatusEnum("procurement_status").notNull().default("not_started"),
  quotedTotalCostCents: integer("quoted_total_cost_cents"),
  actualTotalCostCents: integer("actual_total_cost_cents"),
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workOrderCompletions = pgTable("work_order_completions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  hoursWorkedMinutes: integer("hours_worked_minutes").notNull(),
  completionNotes: text("completion_notes"),
  reviewStatus: completionReviewStatusEnum("review_status").notNull().default("submitted"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  completionId: uuid("completion_id").references(() => workOrderCompletions.id, { onDelete: "cascade" }),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  type: attachmentTypeEnum("type").notNull(),
  fileUrl: text("file_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workOrderEvents = pgTable("work_order_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  type: eventTypeEnum("type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "cascade" }),
  toPhone: text("to_phone").notNull(),
  template: notificationTemplateEnum("template").notNull(),
  payload: jsonb("payload").notNull().default({}),
  sendAt: timestamp("send_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: notificationStatusEnum("status").notNull().default("pending"),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
});

export const emailConfigs = pgTable("email_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  gmailAddress: text("gmail_address").notNull(),
  appPasswordEnc: text("app_password_enc").notNull(),
  fromName: text("from_name"),
  replyTo: text("reply_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgProviderUnique: uniqueIndex("email_configs_org_provider_unique").on(t.organizationId, t.provider),
}));
