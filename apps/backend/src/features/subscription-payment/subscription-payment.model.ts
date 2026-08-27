import { MainSchema } from '@/db/db.schema';
import { numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { SubscriptionInvoiceTable } from '@/features/subscription-invoice/subscription-invoice.model.js';
import {
  PaymentMethodTable,
  type PaymentMethodType,
} from '@/features/payment-method/payment-method.model.js';

/**
 * Six states, because a payment is not a boolean.
 *
 * `initiated` — we asked the gateway; nothing has happened yet.
 * `pending`   — the payer's bank has it. FPX direct debit sits here for DAYS.
 * `succeeded` — money arrived. The only state that settles an invoice.
 * `failed`    — declined, expired, insufficient funds. Retryable.
 * `refunded`  — money arrived and went back. NOT the same as failed, and an
 *               invoice it once settled must stop reading as paid.
 * `voided`    — the record was retracted. This is what an admin pressing
 *               "Mark unpaid" produces: no money ever moved, so calling it
 *               `failed` would invent a decline that never happened, and
 *               deleting the row would erase who asserted the payment and when.
 */
export const subscriptionPaymentStatusValues = [
  'initiated',
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'voided',
] as const;
export type SubscriptionPaymentStatus = (typeof subscriptionPaymentStatusValues)[number];
export const subscriptionPaymentStatusEnum = MainSchema.enum(
  'subscription_payment_status',
  subscriptionPaymentStatusValues,
);

/**
 * The states in which the money is actually with us — the ONE definition of
 * "this invoice is settled", so no surface invents its own. `refunded` is
 * excluded deliberately: it means the money came and went.
 */
export const settledStatuses: readonly SubscriptionPaymentStatus[] = ['succeeded'];

/**
 * ONE ROW PER ATTEMPT — the thing `subscription_invoice` deliberately is not.
 * Migration 0133.
 *
 * This is the same argument that produced `subscription_invoice`, one level
 * down. `member_subscription` could hold no payment state, so invoices were
 * split out of it; an invoice can hold no ATTEMPT state, because an invoice is
 * one obligation and the tries against it are many. A card declines and is
 * retried. A mandate debit sits pending for two days and then fails. A transfer
 * arrives with a bank reference. A charge is refunded. One `status` column on
 * the invoice cannot say any of that, and every one of those is a real thing
 * that happens the week a gateway goes live.
 *
 * It also closes a gap that has nothing to do with gateways. `payment_voucher`
 * has always carried `bank_ref`, so an agency paying a PR records WHICH transfer
 * paid it; the subscription side had no equivalent, and an admin marking an
 * invoice paid left the reference nowhere but their memory. `reference` is that
 * column.
 *
 * WHO and WHICH PERIOD are read through `subscriptionInvoiceId`; nothing is
 * copied. `amount`/`currency`/`methodType` ARE snapshotted, deliberately and for
 * the reason the invoice snapshots its own amount: how a period was actually
 * paid must not change when the org later switches rails or renegotiates.
 */
export const SubscriptionPaymentTable = MainSchema.table('subscription_payment', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  subscriptionInvoiceId: uuid('subscription_invoice_id')
    .notNull()
    .references(() => SubscriptionInvoiceTable.id, { onDelete: 'cascade' }),
  /**
   * Nullable, and ON DELETE SET NULL: a manual bank transfer is paid through no
   * instrument at all, and a venue that removes an old card must not take the
   * record of what it paid with it.
   */
  paymentMethodId: uuid('payment_method_id').references(() => PaymentMethodTable.id, {
    onDelete: 'set null',
  }),
  methodType: varchar('method_type', { length: 30 }).$type<PaymentMethodType>().notNull(),
  gateway: varchar('gateway', { length: 50 }),
  /**
   * The gateway's own id for this payment, and the idempotency key. Unique per
   * gateway where set — gateways retry a webhook until they get a 2xx, so the
   * same settlement arrives three or four times as a matter of course, and
   * without that index the second delivery records a second payment.
   */
  gatewayPaymentId: varchar('gateway_payment_id', { length: 255 }),
  /** The bank/gateway reference a human can match against a statement. */
  reference: varchar('reference', { length: 120 }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  status: subscriptionPaymentStatusEnum('status').notNull().default('initiated'),
  failureReason: varchar('failure_reason', { length: 500 }),
  /** Set only on `succeeded`; the CHECK constraint requires it there. */
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type SubscriptionPayment = typeof SubscriptionPaymentTable.$inferSelect;
export type NewSubscriptionPayment = typeof SubscriptionPaymentTable.$inferInsert;

export type SubscriptionPaymentFilter = {
  subscriptionInvoiceId?: string;
  status?: SubscriptionPaymentStatus;
  gateway?: string;
};
