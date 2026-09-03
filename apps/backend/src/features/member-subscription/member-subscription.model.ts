import { MainSchema } from '@/db/db.schema';
import { numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  SubscriptionTable,
  billingCycleEnum,
} from '@/features/subscription/subscription.model.js';

// Which kind of member holds this subscription. Shared by admin_request too.
export const subscriberTypeValues = ['outlet', 'agency'] as const;
export type SubscriberType = (typeof subscriberTypeValues)[number];
export const subscriberTypeEnum = MainSchema.enum('subscriber_type', subscriberTypeValues);

export const memberSubscriptionStatusValues = ['active', 'cancelled', 'expired', 'past_due'] as const;
export type MemberSubscriptionStatus = (typeof memberSubscriptionStatusValues)[number];
export const memberSubscriptionStatusEnum = MainSchema.enum(
  'member_subscription_status',
  memberSubscriptionStatusValues,
);

/**
 * The statuses that still mean the org IS on this lane.
 *
 * ONE definition, because there were two and they disagreed. The billing side
 * tested `ended_at IS NULL && (active || past_due)`, while the posting gate
 * tested `ended_at IS NULL` alone — so a row an admin set to `cancelled`
 * WITHOUT stamping a date (which `PUT /member-subscription/:id` allows: it takes
 * `status` and `endedAt` independently) was simultaneously "cancelled" for
 * invoicing and "subscribed" for posting. Two answers to one question about one
 * row.
 *
 * `past_due` counts as still subscribed on purpose: an org behind on payment has
 * not left. It is exactly the one that must keep being invoiced — and cutting
 * off its roster over an unpaid invoice is a billing decision nobody made.
 */
export const LIVE_MEMBER_SUBSCRIPTION_STATUSES = ['active', 'past_due'] as const;

// A record of an outlet/agency subscribing to a plan (the "who subscribed & when" ledger).
// Powers the admin plan dashboard, subscription history (date/time filter) and monthly
// subscription-revenue totals. Snapshots subscriber/plan names so history stays readable
// even if the source outlet/agency/plan is later renamed or removed.
export const MemberSubscriptionTable = MainSchema.table('member_subscription', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  subscriberType: subscriberTypeEnum('subscriber_type').notNull(),
  subscriberId: uuid('subscriber_id').notNull(),
  subscriberName: varchar('subscriber_name', { length: 255 }).notNull(),
  subscriptionId: uuid('subscription_id').references(() => SubscriptionTable.id, { onDelete: 'set null' }),
  planName: varchar('plan_name', { length: 255 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  status: memberSubscriptionStatusEnum('status').notNull().default('active'),
  // Which negotiation set this price, when one did (POS quote, Custom
  // renegotiation). Without it an unusual amount cannot be traced back to the
  // quote that agreed it. Migration 0081.
  adminRequestId: uuid('admin_request_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type MemberSubscription = typeof MemberSubscriptionTable.$inferSelect;
export type MemberSubscriptionInsertType = typeof MemberSubscriptionTable.$inferInsert;

export type MemberSubscriptionFilter = {
  subscriberType?: SubscriberType;
  subscriberId?: string;
  subscriptionId?: string;
  status?: MemberSubscriptionStatus;
  from?: Date;
  to?: Date;
  /** Exact calendar days (YYYY-MM-DD) — subscriptions whose startedAt falls on any of these days. */
  dates?: string[];
  /** Case-insensitive partial match on the subscriber (outlet/agency) name. */
  search?: string;
  /**
   * Collapse to ONE row per subscriber — the one it is on now (newest by
   * started_at). The admin History page uses it so a venue that switched plans
   * shows its current plan, not every plan it has ever been on.
   */
  latestPerSubscriber?: boolean;
  /**
   * Plans only, or add-ons only. "What is this venue on?" means its PLAN — its
   * POS add-on line is newer and would otherwise be mistaken for it.
   */
  kind?: 'plan' | 'addon';
};
