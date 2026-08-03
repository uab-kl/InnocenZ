import { MainSchema } from '@/db/db.schema';
import { numeric, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';
import { subscriberTypeEnum } from '@/features/member-subscription/member-subscription.model.js';

// 'pos_integration_quote' = outlet "Integrate with POS → Request admin quote";
// 'custom_renegotiation' = agency Custom (151+ PV) "Renegotiate Price".
// These two are the Plan Request inbox; 'plan_change' has its own page.
export const adminRequestTypeValues = [
  'pos_integration_quote',
  'custom_renegotiation',
  'plan_change',
  'contact',
  'other',
] as const;
export type AdminRequestType = (typeof adminRequestTypeValues)[number];
export const adminRequestTypeEnum = MainSchema.enum('admin_request_type', adminRequestTypeValues);

// Plan-change statuses: outlet switches wait as 'pending' until the admin marks
// them 'approved' or 'declined'; agency switches are applied automatically by PR
// count and are recorded as 'direct' (no approval step).
export const adminRequestStatusValues = [
  'pending',
  'contacted',
  'resolved',
  'declined',
  'direct',
  'approved',
] as const;
export type AdminRequestStatus = (typeof adminRequestStatusValues)[number];
export const adminRequestStatusEnum = MainSchema.enum('admin_request_status', adminRequestStatusValues);

// Requests raised by outlets/agencies for the admin to action (POS-integration quote,
// plan change, general contact). Pending rows also drive the admin notification bell.
export const AdminRequestTable = MainSchema.table('admin_request', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  type: adminRequestTypeEnum('type').notNull().default('contact'),
  subscriberType: subscriberTypeEnum('subscriber_type'),
  subscriberId: uuid('subscriber_id'),
  subscriberName: varchar('subscriber_name', { length: 255 }).notNull(),
  contactName: varchar('contact_name', { length: 100 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  currentPlanId: uuid('current_plan_id').references(() => SubscriptionTable.id, { onDelete: 'set null' }),
  /** Plan-change only: the tier the subscriber is switching to. */
  requestedPlanId: uuid('requested_plan_id').references(() => SubscriptionTable.id, {
    onDelete: 'set null',
  }),
  message: text('message'),
  // Admin-authored notes about the request so other admins can refer to what was asked.
  remarks: text('remarks'),
  status: adminRequestStatusEnum('status').notNull().default('pending'),
  // The price the admin quoted/negotiated for this request. Set when a negotiation
  // succeeds (e.g. POS-integration quote, agency custom-tier renegotiation); null otherwise.
  quotedAmount: numeric('quoted_amount', { precision: 12, scale: 2 }),
  contactedAt: timestamp('contacted_at', { withTimezone: true }),
  contactedBy: varchar('contacted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type AdminRequest = typeof AdminRequestTable.$inferSelect;
export type AdminRequestInsertType = typeof AdminRequestTable.$inferInsert;

export type AdminRequestFilter = {
  /** One type, or a whitelist of types (e.g. the Plan Request inbox pair). */
  type?: AdminRequestType | AdminRequestType[];
  /** Exclude a single type (e.g. plan_change, which has its own page). */
  excludeType?: AdminRequestType;
  status?: AdminRequestStatus;
  subscriberType?: 'outlet' | 'agency';
  /** Match rows requested on any of these calendar days (createdAt). */
  dates?: string[];
  /**
   * Collapse to the newest request per subscriber. The Plan Change page uses it
   * so a venue that switched three times is one row to answer, not three.
   */
  latestPerSubscriber?: boolean;
  /** Case-insensitive partial match on the subscriber (outlet/agency) name. */
  search?: string;
  /**
   * Split the two admin inboxes by whether a request touches a NEGOTIATED
   * arrangement — the POS add-on, or the Custom tier — in any direction.
   *
   * - `'only'`  → Plan Request: everything involving POS/Custom, joining or
   *               leaving, because those carry a price somebody agreed.
   * - `'exclude'` → Plan Change: ordinary plan-to-plan switches only.
   *
   * A request counts as negotiated when its type is a POS quote or a Custom
   * renegotiation, OR when it is a plan change whose from- or to-plan is Custom
   * or an add-on. Without the second half, "Enterprise → Custom" is a plain
   * plan_change and would sit in the wrong inbox.
   */
  negotiated?: 'only' | 'exclude';
};
