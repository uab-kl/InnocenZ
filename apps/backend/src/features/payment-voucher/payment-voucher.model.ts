import { date, integer, jsonb, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { PrTable } from '@/features/pr/pr.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';

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

/**
 * One SCANNED OR SELF-LOGGED RECEIPT (an order slip) — the grouping between a
 * voucher and its item lines: voucher → receipts → lines. `receiptNo` is the
 * database-generated running number (RCP-000001, unique); `orderNo` is what
 * OCR read off the paper ("ORD0389"). Outlet/PR context comes via the FKs
 * (voucher, shift assignment) — never duplicated here.
 */
export const PaymentVoucherReceiptTable = MainSchema.table('payment_voucher_receipt', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  voucherId: uuid('voucher_id')
    .notNull()
    .references(() => PaymentVoucherTable.id, { onDelete: 'cascade' }),
  // The shift this receipt was logged during (between Time-In and Time-Out).
  shiftAssignmentId: uuid('shift_assignment_id').references(() => ShiftAssignmentTable.id, {
    onDelete: 'set null',
  }),
  // Auto-generated unique running number: RCP-000001, RCP-000002, …
  receiptNo: varchar('receipt_no', { length: 40 }).notNull().unique(),
  // The order number OCR read off the receipt (e.g. ORD0389) — one paper
  // receipt can only be logged once per voucher (checked in the controller).
  orderNo: varchar('order_no', { length: 100 }),
  // 'scan' (OCR, auto-verified) or 'manual' (self-log, agency verifies).
  source: varchar('source', { length: 20 }).notNull().default('manual'),
  // Date + time printed on the receipt, as OCR read them.
  receiptDate: date('receipt_date', { mode: 'string' }),
  receiptTime: varchar('receipt_time', { length: 10 }),
  // PR's note to the agency (REQUIRED on self-logs: what was unclear on the
  // paper — quantity / price / date — or confirmation everything matches).
  note: varchar('note', { length: 1000 }),
  proofPhotos: jsonb('proof_photos').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

/** One earning line on a voucher (frontend `PrPvRow`). Replaced wholesale on update. */
export const PaymentVoucherLineTable = MainSchema.table('payment_voucher_line', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  voucherId: uuid('voucher_id')
    .notNull()
    .references(() => PaymentVoucherTable.id, { onDelete: 'cascade' }),
  // The receipt this line came from (FK) — null for wage seals / legacy lines.
  receiptId: uuid('receipt_id').references(() => PaymentVoucherReceiptTable.id, {
    onDelete: 'set null',
  }),
  lineDate: date('line_date', { mode: 'string' }),
  outlet: varchar('outlet', { length: 255 }),
  description: varchar('description', { length: 500 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  ref: varchar('ref', { length: 100 }),
  // Proof photo(s) the PR snaps when self-logging (one or many). Same jsonb
  // array-of-paths pattern as user_profile.portfolio_photos; agency verifies
  // against these. Null when the entry carries no proof (OCR scan, wages seal).
  proofPhotos: jsonb('proof_photos').$type<string[]>(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull().default('system'),
  updatedBy: varchar('updated_by').notNull().default('system'),
});

export type PaymentVoucherType = typeof PaymentVoucherTable.$inferSelect;
export type PaymentVoucherInsertType = typeof PaymentVoucherTable.$inferInsert;
export type PaymentVoucherReceiptType = typeof PaymentVoucherReceiptTable.$inferSelect;
export type PaymentVoucherReceiptInsertType = typeof PaymentVoucherReceiptTable.$inferInsert;
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
