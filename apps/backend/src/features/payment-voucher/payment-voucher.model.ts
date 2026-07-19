import { date, integer, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { PrTable } from '@/features/pr/pr.model';

// Mirrors the frontend PrPvStatus lifecycle (agency-portal pr-demo).
export const paymentVoucherStatusValues = [
  'pending_review',
  'sent',
  'signed',
  'paid',
  'disputed',
] as const;
export type PaymentVoucherStatus = (typeof paymentVoucherStatusValues)[number];
export const paymentVoucherStatusEnum = MainSchema.enum(
  'payment_voucher_status',
  paymentVoucherStatusValues,
);

/**
 * A weekly payment voucher issued by an agency to a PR. This is the core
 * persisted shape of the frontend `PrPaymentVoucher`; signature images,
 * dispute photos and escalation are follow-ups.
 */
export const PaymentVoucherTable = MainSchema.table('payment_voucher', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  // Nullable: a voucher can be issued to a payee not (yet) registered as a PR.
  prId: uuid('pr_id').references(() => PrTable.id, { onDelete: 'set null' }),
  prName: varchar('pr_name', { length: 255 }).notNull(),
  prIc: varchar('pr_ic', { length: 100 }),
  outlet: varchar('outlet', { length: 255 }),
  cycle: varchar('cycle', { length: 100 }),
  issuedDate: date('issued_date', { mode: 'string' }),
  dueDate: date('due_date', { mode: 'string' }),
  weekStart: date('week_start', { mode: 'string' }),
  weekEnd: date('week_end', { mode: 'string' }),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  deduction: numeric('deduction', { precision: 12, scale: 2 }).notNull().default('0'),
  net: numeric('net', { precision: 12, scale: 2 }).notNull().default('0'),
  status: paymentVoucherStatusEnum('status').notNull().default('pending_review'),
  financeHeadName: varchar('finance_head_name', { length: 255 }),
  financeHeadSignedAt: timestamp('finance_head_signed_at', { withTimezone: true }),
  prSignedAt: timestamp('pr_signed_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  bankRef: varchar('bank_ref', { length: 100 }),
  disputeReason: varchar('dispute_reason', { length: 1000 }),
  disputedAt: timestamp('disputed_at', { withTimezone: true }),
  disputeNote: varchar('dispute_note', { length: 1000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

/** One earning line on a voucher (frontend `PrPvRow`). Replaced wholesale on update. */
export const PaymentVoucherLineTable = MainSchema.table('payment_voucher_line', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  voucherId: uuid('voucher_id')
    .notNull()
    .references(() => PaymentVoucherTable.id, { onDelete: 'cascade' }),
  lineDate: date('line_date', { mode: 'string' }),
  outlet: varchar('outlet', { length: 255 }),
  description: varchar('description', { length: 500 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  ref: varchar('ref', { length: 100 }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export type PaymentVoucherType = typeof PaymentVoucherTable.$inferSelect;
export type PaymentVoucherInsertType = typeof PaymentVoucherTable.$inferInsert;
export type PaymentVoucherLineType = typeof PaymentVoucherLineTable.$inferSelect;
export type PaymentVoucherLineInsertType = typeof PaymentVoucherLineTable.$inferInsert;

export type PaymentVoucherWithLines = PaymentVoucherType & {
  lines: PaymentVoucherLineType[];
};

export type PaymentVoucherFilter = {
  id?: string;
  agencyId?: string;
  prId?: string;
  status?: PaymentVoucherStatus;
  prName?: string;
  fromDate?: string;
  toDate?: string;
};
