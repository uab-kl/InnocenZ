import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
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
  /** Finger-drawn signature strokes ({w,h,strokes}) — written only on PR sign. */
  prSignature: text('pr_signature'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  bankRef: varchar('bank_ref', { length: 100 }),
  disputeReason: varchar('dispute_reason', { length: 1000 }),
  disputedAt: timestamp('disputed_at', { withTimezone: true }),
  disputeNote: varchar('dispute_note', { length: 1000 }),
  // NOTE: these three dispute_* columns are superseded by
  // PaymentVoucherDisputeTable (migration 0051) and kept only so the current
  // controller keeps working. Read new code against that table; a follow-up
  // migration drops these once nothing reads them.
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
/**
 * Which bucket a voucher line belongs to. The PG type `payment_voucher_component`
 * is LIVE (migration 0051) — this declaration exists to match it. Without it
 * drizzle-kit sees a column the schema does not declare and generates a DROP.
 */
export const paymentVoucherComponentValues = [
  'wages',
  'drink_commission',
  'tip_commission',
  'ot',
  'deduction',
  'other',
] as const;
export type PaymentVoucherComponent = (typeof paymentVoucherComponentValues)[number];
export const paymentVoucherComponentEnum = MainSchema.enum(
  'payment_voucher_component',
  paymentVoucherComponentValues,
);

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
  /**
   * Which bucket this line belongs to (migration 0051). NULL means the row
   * predates classification — distinguishable from a genuine 'other'. New
   * writes should always set it.
   */
  component: paymentVoucherComponentEnum('component'),
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

/** How a dispute ended. NULL outcome = still awaiting agency review. */
export const paymentVoucherDisputeOutcomeValues = ['accepted', 'rejected', 'withdrawn'] as const;
export type PaymentVoucherDisputeOutcome = (typeof paymentVoucherDisputeOutcomeValues)[number];
export const paymentVoucherDisputeOutcomeEnum = MainSchema.enum(
  'payment_voucher_dispute_outcome',
  paymentVoucherDisputeOutcomeValues,
);

/**
 * Which part of a day's earnings is being disputed.
 *
 * MUST stay in step with `prReceiptKindValues` in
 * `@/schema/payment-voucher.schema` — the same vocabulary a voucher line
 * already carries inside its packed `ref`. Not imported from there because
 * that module imports this one; duplicated deliberately, with this note.
 */
export const paymentVoucherDisputeComponentValues = [
  'wages',
  'drinks',
  'tips',
  'others',
] as const;
export type PaymentVoucherDisputeComponent =
  (typeof paymentVoucherDisputeComponentValues)[number];
export const paymentVoucherDisputeComponentEnum = MainSchema.enum(
  'payment_voucher_dispute_component',
  paymentVoucherDisputeComponentValues,
);

/**
 * One dispute a PR raised on a single shift DAY and a single COMPONENT of it
 * (migration 0051).
 *
 * A PR may dispute freely across a month, but `UNIQUE (voucherId, disputeDate,
 * component)` allows each day+component exactly once — so 23/7 wages and 23/7
 * drinks are separate disputes, while 23/7 wages twice is refused by the
 * database rather than by controller convention.
 *
 * Deliberately NOT keyed to a `PaymentVoucherLineTable` row: lines are deleted
 * and re-inserted wholesale on every voucher update (repository.ts:61), and
 * that rewrite is exactly what happens when the agency accepts — a line-keyed
 * dispute would destroy the row it points at at the moment it succeeded.
 */
export const PaymentVoucherDisputeTable = MainSchema.table('payment_voucher_dispute', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  voucherId: uuid('voucher_id')
    .notNull()
    .references(() => PaymentVoucherTable.id, { onDelete: 'cascade' }),
  /** The disputed shift day — pairs with PaymentVoucherLineTable.lineDate. */
  disputeDate: date('dispute_date', { mode: 'string' }).notNull(),
  component: paymentVoucherDisputeComponentEnum('component').notNull(),
  reason: varchar('reason', { length: 1000 }),
  note: varchar('note', { length: 1000 }),
  raisedAt: timestamp('raised_at', { withTimezone: true }).defaultNow().notNull(),
  /**
   * What the voucher said when raised. Compute server-side from the lines —
   * never accept it from the client, it is the baseline of a money claim.
   */
  disputedAmount: numeric('disputed_amount', { precision: 12, scale: 2 }),
  /** What the PR says it should be. */
  claimedAmount: numeric('claimed_amount', { precision: 12, scale: 2 }),
  /**
   * Evidence, required on new rows by a NOT VALID check constraint. Same
   * array-of-paths shape as PaymentVoucherLineTable.proofPhotos. Treat as
   * immutable once submitted, or the agency's decision stops referring to what
   * they actually saw.
   */
  proofPhotos: jsonb('proof_photos').$type<string[]>(),
  /** Receipts pointed at, by the reference packed in line.ref — not line id. */
  receiptRefs: jsonb('receipt_refs').$type<string[]>(),
  outcome: paymentVoucherDisputeOutcomeEnum('outcome'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: varchar('resolved_by'),
  resolutionNote: varchar('resolution_note', { length: 1000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (table) => [
    // One dispute per day per component — 23/7 wages and 23/7 drinks stay
    // separate, 23/7 wages twice is refused by the database.
    uniqueIndex('payment_voucher_dispute_one_per_day_component').on(
      table.voucherId,
      table.disputeDate,
      table.component,
    ),
    // The agency queue: everything still awaiting review, oldest first.
    index('payment_voucher_dispute_open_idx')
      .on(table.raisedAt)
      .where(sql`${table.outcome} is null`),
  ],
);

export const paymentVoucherDayReviewStatusValues = ['approved', 'held'] as const;
export type PaymentVoucherDayReviewStatus =
  (typeof paymentVoucherDayReviewStatusValues)[number];
export const paymentVoucherDayReviewStatusEnum = MainSchema.enum(
  'payment_voucher_day_review_status',
  paymentVoucherDayReviewStatusValues,
);

/**
 * The agency's day-by-day sign-off on a voucher, before it goes to the PR.
 *
 * A week is rarely wrong all at once — one bad Tuesday should not hold the other
 * six days, so review is per shift DAY. Note the asymmetry with
 * `PaymentVoucherDisputeTable`, which is per day AND component: the agency
 * reviews a day's work as a unit (the components are the evidence inside it),
 * while a PR contests one component of it. Approving a day therefore means "I
 * checked this", not "this can no longer be challenged".
 *
 * Keyed to the DATE, never to a `PaymentVoucherLineTable` row — for exactly the
 * reason spelled out on the dispute table: lines are deleted and re-inserted
 * wholesale on every voucher update, so a line-keyed review would be destroyed
 * by the next regeneration.
 *
 * **There is no `pending` state.** A day with no row has not been reviewed;
 * un-approving deletes the row. Storing pending rows would mean pre-creating one
 * per day and keeping them in step with a line set that gets rewritten.
 */
export const PaymentVoucherDayReviewTable = MainSchema.table(
  'payment_voucher_day_review',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => PaymentVoucherTable.id, { onDelete: 'cascade' }),
    /** The reviewed shift day — pairs with PaymentVoucherLineTable.lineDate. */
    reviewDate: date('review_date', { mode: 'string' }).notNull(),
    status: paymentVoucherDayReviewStatusEnum('status').notNull(),
    /**
     * The day's total, in integer CENTS, at the moment it was approved.
     *
     * Without this an approval is a claim about nothing: a day signed off at
     * RM 300 that later regenerates to RM 420 would still read "approved", and
     * the agency would have attested to one figure while the PR was sent
     * another. Recompute the day from the lines on read and treat a mismatch as
     * STALE — re-surface it rather than trusting the row. Cents for the same
     * reason the Σ=0 check uses them: this is money, not a display value.
     */
    approvedTotalCents: integer('approved_total_cents'),
    note: varchar('note', { length: 1000 }),
    /**
     * True when the day was cleared by "approve all" rather than opened and
     * approved on its own. Recorded because the two are genuinely different
     * claims, and a reviewer should be able to tell later which one they made.
     */
    bulk: boolean('bulk').notNull().default(false),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedBy: varchar('reviewed_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (table) => [
    // One review per day. Re-approving updates the row rather than stacking.
    uniqueIndex('payment_voucher_day_review_one_per_day').on(table.voucherId, table.reviewDate),
  ],
);

export type PaymentVoucherDayReviewType = typeof PaymentVoucherDayReviewTable.$inferSelect;
export type PaymentVoucherDayReviewInsertType =
  typeof PaymentVoucherDayReviewTable.$inferInsert;

export type PaymentVoucherType = typeof PaymentVoucherTable.$inferSelect;
export type PaymentVoucherInsertType = typeof PaymentVoucherTable.$inferInsert;
export type PaymentVoucherReceiptType = typeof PaymentVoucherReceiptTable.$inferSelect;
export type PaymentVoucherReceiptInsertType = typeof PaymentVoucherReceiptTable.$inferInsert;
export type PaymentVoucherLineType = typeof PaymentVoucherLineTable.$inferSelect;
export type PaymentVoucherLineInsertType = typeof PaymentVoucherLineTable.$inferInsert;
export type PaymentVoucherDisputeType = typeof PaymentVoucherDisputeTable.$inferSelect;
export type PaymentVoucherDisputeInsertType = typeof PaymentVoucherDisputeTable.$inferInsert;

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
