import { MainSchema } from '@/db/db.schema';
import { numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model.js';
import { SubscriptionInvoiceTable } from './subscription-invoice.model.js';

export const subscriptionCreditStatusValues = ['open', 'applied', 'void'] as const;
export type SubscriptionCreditStatus = (typeof subscriptionCreditStatusValues)[number];

/**
 * MONEY AN ORG HAS ALREADY PAID FOR A PLAN IT NO LONGER HOLDS (migration 0147).
 *
 * Born when a PAID period is moved to a cheaper plan: the difference becomes a
 * credit, and the next period minted on the same lane takes it off the top
 * (`subscription_invoice.credit_applied`). Its own row rather than a negative
 * invoice, because a credit has a life an invoice does not — open, partly used,
 * used — and because `amount >= 0` on invoices is right and stays.
 *
 * WHO the credit belongs to is read through `memberSubscriptionId`; nothing
 * about the org is copied here.
 */
export const SubscriptionCreditTable = MainSchema.table('subscription_credit', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  memberSubscriptionId: uuid('member_subscription_id')
    .notNull()
    .references(() => MemberSubscriptionTable.id, { onDelete: 'cascade' }),
  sourceInvoiceId: uuid('source_invoice_id').references(() => SubscriptionInvoiceTable.id, {
    onDelete: 'set null',
  }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  remaining: numeric('remaining', { precision: 12, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).$type<SubscriptionCreditStatus>().notNull().default('open'),
  reason: varchar('reason', { length: 255 }),
  appliedToInvoiceId: uuid('applied_to_invoice_id').references(() => SubscriptionInvoiceTable.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type SubscriptionCredit = typeof SubscriptionCreditTable.$inferSelect;
