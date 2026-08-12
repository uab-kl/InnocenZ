import { MainSchema } from '@/db/db.schema';
import { date, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  MemberSubscriptionTable,
  type SubscriberType,
} from '@/features/member-subscription/member-subscription.model.js';

// Two states, because that is the whole decision: an admin has seen the money
// arrive, or has not. `unpaid` is the default and stays until a human says
// otherwise — nothing in this app can observe a bank transfer, so no automatic
// transition to `paid` exists or should.
export const subscriptionInvoiceStatusValues = ['unpaid', 'paid'] as const;
export type SubscriptionInvoiceStatus = (typeof subscriptionInvoiceStatusValues)[number];
export const subscriptionInvoiceStatusEnum = MainSchema.enum(
  'subscription_invoice_status',
  subscriptionInvoiceStatusValues,
);

/**
 * ONE ROW PER CHARGE — the thing `member_subscription` deliberately is not.
 *
 * `member_subscription` is a "who subscribed and when" ledger: a plan switch
 * ends one row and starts another, it holds no payment state, and most of its
 * ended rows lived for less than a day. Payment cannot be read out of it, which
 * is why both Subscription screens could say what an org was ON but never what
 * it had PAID.
 *
 * This table is the missing half. One row per BILLING PERIOD per subscription —
 * agency weekly (Sun–Sat, the project-wide payroll week), outlet monthly
 * (anchored on the day the subscription started) — carrying the state an admin
 * sets by hand.
 *
 * Everything about WHO and WHICH PLAN is read through `member_subscription_id`;
 * no name is copied here. `amount` and `currency` are the exception, and they
 * are a deliberate snapshot rather than a duplicate: a Custom price renegotiated
 * in September must not silently rewrite what August was billed at — the same
 * reasoning `member_subscription` already applies to its own name columns.
 */
export const SubscriptionInvoiceTable = MainSchema.table('subscription_invoice', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  memberSubscriptionId: uuid('member_subscription_id')
    .notNull()
    .references(() => MemberSubscriptionTable.id, { onDelete: 'cascade' }),
  // Calendar days, not instants — a billing period has no time of day, and
  // `date(mode:'string')` keeps these directly comparable with `klToday()` and
  // with every existing week_start/week_end column in the schema.
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  periodEnd: date('period_end', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  status: subscriptionInvoiceStatusEnum('status').notNull().default('unpaid'),
  // Set when an admin marks it paid, cleared when they take that back. Never
  // written by the generator.
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type SubscriptionInvoice = typeof SubscriptionInvoiceTable.$inferSelect;
export type SubscriptionInvoiceInsertType = typeof SubscriptionInvoiceTable.$inferInsert;

/**
 * An invoice with the facts that live on the subscription it belongs to. Joined
 * on read rather than copied on write — see the table comment.
 */
export type SubscriptionInvoiceWithSubscriber = SubscriptionInvoice & {
  subscriberType: SubscriberType;
  subscriberId: string;
  subscriberName: string;
  planName: string;
  billingCycle: string;
};

export type SubscriptionInvoiceFilter = {
  subscriberType?: SubscriberType;
  subscriberId?: string;
  memberSubscriptionId?: string;
  status?: SubscriptionInvoiceStatus;
  /** Periods starting on or after this calendar day (YYYY-MM-DD). */
  from?: string;
  /** Periods starting on or before this calendar day (YYYY-MM-DD). */
  to?: string;
  /** Exact calendar days (YYYY-MM-DD) — invoices whose period_start is one of them. */
  dates?: string[];
  /** Case-insensitive partial match on the subscriber (outlet/agency) name. */
  search?: string;
};
