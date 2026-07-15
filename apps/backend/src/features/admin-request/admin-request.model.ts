import { MainSchema } from '@/db/db.schema';
import { numeric, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';
import { subscriberTypeEnum } from '@/features/member-subscription/member-subscription.model.js';

export const adminRequestTypeValues = ['pos_integration_quote', 'plan_change', 'contact', 'other'] as const;
export type AdminRequestType = (typeof adminRequestTypeValues)[number];
export const adminRequestTypeEnum = MainSchema.enum('admin_request_type', adminRequestTypeValues);

export const adminRequestStatusValues = ['pending', 'contacted', 'resolved'] as const;
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
  type?: AdminRequestType;
  status?: AdminRequestStatus;
  subscriberType?: 'outlet' | 'agency';
};
