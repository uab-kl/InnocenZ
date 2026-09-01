import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { PaymentVoucherTable } from './payment-voucher.model';

/**
 * WHERE A PR IS PAID, resolved through the account rather than the voucher.
 *
 * `payable` is computed in ONE place (`listPayeeBanks`) so the CSV builder, the
 * agency's detail panel and any future provider driver cannot disagree about
 * who is ready to be paid. Both halves are required: a bank with no account
 * number is exactly as unpayable as neither.
 */
export type PayeeBank = {
  name: string | null;
  icNo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  payable: boolean;
};

/**
 * HOW the money is meant to move for one batch.
 *
 * `ibg` — PayNet's batch credit transfer, the cheapest domestic rail and what
 * Malaysian payroll actually runs on; same business day if submitted before 4pm.
 * `duitnow` — instant and 24/7, and the one that can address a payee by PROXY
 * (mobile number) instead of an account number.
 * `manual` — the agency keyed the transfers by hand. This is not a lesser
 * option to be migrated away from: it is what every agency does today, and a
 * batch must be able to record it, or the app's idea of "paid" drifts from the
 * bank's the moment anyone pays outside a file.
 * `provider` — a licensed payout API did it. Reserved; nothing sets it until an
 * agency has credentials. See `payout-provider.ts`.
 */
export const payoutMethodValues = ['ibg', 'duitnow', 'manual', 'provider'] as const;
export type PayoutMethod = (typeof payoutMethodValues)[number];
export const payoutMethodEnum = MainSchema.enum('payout_method', payoutMethodValues);

/**
 * A batch's own lifecycle — deliberately NOT the same as its items'.
 *
 * `draft` — assembled, nothing has left the building.
 * `exported` — a file was downloaded. The agency now holds something their bank
 * can accept, and the app has no idea what they do with it next.
 * `submitted` — the agency says they uploaded and authorised it.
 * `settled` — every item reached a terminal state. NOT a synonym for "all paid":
 * a batch where 57 of 59 landed and 2 bounced is settled, with its two failures
 * visible, which is the only honest way to close a run.
 * `cancelled` — abandoned before submission.
 *
 * There is no `failed`: a batch does not fail, its ITEMS do. Collapsing the two
 * would hide 57 successful payments behind one red word.
 */
export const payoutBatchStatusValues = [
  'draft',
  'exported',
  'submitted',
  'settled',
  'cancelled',
] as const;
export type PayoutBatchStatus = (typeof payoutBatchStatusValues)[number];
export const payoutBatchStatusEnum = MainSchema.enum(
  'payout_batch_status',
  payoutBatchStatusValues,
);

/**
 * ONE RUN OF MONEY OUT OF AN AGENCY — the record `payment_voucher.status='paid'`
 * could never hold on its own.
 *
 * A voucher's status answers "has this person been paid?" with one word. A run
 * has to answer more: what was sent, to which account, on what day, by whom,
 * and — the part that matters — which lines came BACK. That is a lifecycle, and
 * the same reasoning that made `subscription_invoice` a table rather than a
 * column on the subscription applies here.
 *
 * ⚠️ InnocenZ NEVER HOLDS THIS MONEY (owner's decision, 27 Aug 2026). The agency
 * is the payer of record and funds move from the agency's own bank or its own
 * provider account. This table RECORDS a transfer; it does not make one.
 * Anything that would make InnocenZ the payer is an e-money / remittance
 * question under FSA 2013 and MSBA 2011, not a schema question.
 */
export const PayoutBatchTable = MainSchema.table(
  'payout_batch',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    /** Human-facing run number, `PO-000001`. Allocated once on insert. */
    reference: varchar('reference', { length: 40 }).unique(),
    /**
     * The payroll week this run settles. Nullable because a batch need not be a
     * week — a re-run for two bounced payments belongs to no week in particular.
     */
    weekStart: date('week_start', { mode: 'string' }),
    weekEnd: date('week_end', { mode: 'string' }),
    method: payoutMethodEnum('method').notNull().default('ibg'),
    status: payoutBatchStatusEnum('status').notNull().default('draft'),
    /** Which payout API moved this, e.g. 'curlec'. NULL for file and manual runs. */
    provider: varchar('provider', { length: 40 }),
    /** The provider's own batch id, for reconciliation against their dashboard. */
    providerBatchId: varchar('provider_batch_id', { length: 120 }),
    /**
     * Σ(item amounts) AS EXPORTED — a snapshot, not a live sum.
     *
     * Recomputing this from the vouchers on read would let a voucher edited
     * after export silently restate what was sent to a bank. What left the
     * building cannot change afterwards.
     */
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    itemCount: integer('item_count').notNull().default(0),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    note: varchar('note', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => [
    // The agency's own run list, newest first.
    index('payout_batch_agency_idx').on(table.agencyId, table.createdAt),
  ],
);

/**
 * How one line of a run ended.
 *
 * `pending` — in the batch, not yet sent.
 * `sent` — it was in the file the agency submitted, or handed to a provider.
 * `paid` — the money landed. Only this writes back to the voucher.
 * `failed` — the bank or provider rejected it (bad account number, closed
 * account). The commonest real outcome after a typo, and the whole reason items
 * carry a status of their own.
 * `returned` — it left, then came back days later. Distinct from `failed`
 * because the voucher was already marked paid and now has to be un-paid, which
 * is a different repair from one that never left.
 */
export const payoutItemStatusValues = [
  'pending',
  'sent',
  'paid',
  'failed',
  'returned',
  'cancelled',
] as const;

/**
 * The states that make a voucher UNAVAILABLE for a new run (migration 0142).
 *
 * Blocking: in a live draft, out with a bank, or done. NOT blocking: 'failed'
 * (retrying a rejection is the whole point), 'returned' (it left and came back,
 * so it must be re-payable) and 'cancelled' (never sent at all).
 *
 * Declared once and used by BOTH the read-time check and the partial unique
 * index that backs it, so the two cannot drift into disagreeing about who is
 * free to be paid.
 */
export const payoutItemBlockingStatuses = ['pending', 'sent', 'paid'] as const;
export type PayoutItemStatus = (typeof payoutItemStatusValues)[number];
export const payoutItemStatusEnum = MainSchema.enum(
  'payout_item_status',
  payoutItemStatusValues,
);

/**
 * One payee line in a run.
 *
 * ⚠️ THE PAYEE COLUMNS HERE ARE A SNAPSHOT, AND THAT IS NOT A DUPLICATE.
 *
 * The database rule is that one fact lives in one table and others reach it by
 * FK — and the LIVE bank details do live once, on `user_profile`, reached
 * through the voucher. These columns hold a different fact: what was actually
 * written into the file the bank received, on the day it was received. The two
 * diverge the moment a PR corrects their account number, and when a payment
 * bounces the only useful question is "what did we send?", never "what does
 * their profile say today".
 *
 * This is the same reasoning already applied twice in this feature —
 * `payment_voucher_dispute.disputed_amount` ("what the voucher said when
 * raised") and `payment_voucher_day_review.approved_total_cents`. A snapshot of
 * a claim is not a copy of a fact.
 */
export const PayoutBatchItemTable = MainSchema.table(
  'payout_batch_item',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => PayoutBatchTable.id, { onDelete: 'cascade' }),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => PaymentVoucherTable.id, { onDelete: 'cascade' }),
    /** What was sent to the bank — see the note above. */
    payeeName: varchar('payee_name', { length: 255 }),
    payeeIc: varchar('payee_ic', { length: 100 }),
    bankName: varchar('bank_name', { length: 255 }),
    bankAccountNo: varchar('bank_account_no', { length: 50 }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    status: payoutItemStatusEnum('status').notNull().default('pending'),
    /** The bank's or provider's own words. Kept verbatim — it is the evidence. */
    failureReason: varchar('failure_reason', { length: 500 }),
    /** Per-line provider reference, where a provider issues one. */
    providerPayoutId: varchar('provider_payout_id', { length: 120 }),
    /** The bank's reference for THIS line, which is what reconciles a statement. */
    bankRef: varchar('bank_ref', { length: 100 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (table) => [
    // One line per voucher per batch. Re-adding updates rather than stacking,
    // so a rebuilt draft cannot pay the same person twice out of one run.
    uniqueIndex('payout_batch_item_one_per_voucher').on(table.batchId, table.voucherId),
    // "Has this voucher already gone out?" — the question the builder asks
    // before putting a voucher into a new batch.
    index('payout_batch_item_voucher_idx').on(table.voucherId),
    /**
     * ONE LIVE LINE PER VOUCHER (migration 0142) — declared here as well as in
     * SQL for the drift class that runs the dangerous way round: a constraint
     * the database HAS and the model does NOT is one `generate` away from being
     * silently dropped, and nothing would fail.
     *
     * This is the guard `alreadyBatched` cannot be: a read cannot see a
     * concurrent insert, so two creates in the same second both found the
     * voucher free. Same failure the coworker measured on subscriptions (three
     * 'succeeded' rows on one invoice) and fixed the same way.
     */
    uniqueIndex('payout_batch_item_one_live_per_voucher')
      .on(table.voucherId)
      .where(sql`${table.status} in ('pending', 'sent', 'paid')`),
  ],
);

export type PayoutBatchType = typeof PayoutBatchTable.$inferSelect;
export type PayoutBatchInsertType = typeof PayoutBatchTable.$inferInsert;
export type PayoutBatchItemType = typeof PayoutBatchItemTable.$inferSelect;
export type PayoutBatchItemInsertType = typeof PayoutBatchItemTable.$inferInsert;

export type PayoutBatchWithItems = PayoutBatchType & {
  items: PayoutBatchItemType[];
};

/**
 * ⚠️ THE ONE PLACE AN ACCOUNT NUMBER IS ALLOWED OUT — masked.
 *
 * The CSV the agency uploads needs the full number and is built server-side
 * from the row. NOTHING ELSE does: a screen showing a run needs to identify an
 * account, not reproduce it, and last-4 identifies it.
 *
 * Written as a model-layer projection rather than a strip in each handler for
 * the reason `toPublicPaymentMethod` gives next door — per-lane stripping was
 * forgotten repeatedly, and this feature already has four handlers returning
 * items. A fifth will be added by someone who does not read this file.
 */
export type PublicPayoutBatchItem = Omit<PayoutBatchItemType, 'bankAccountNo'> & {
  /** Last 4 only, e.g. '••••8901'. Null stays null — "not provided" is a fact. */
  bankAccountMasked: string | null;
};

export function maskBankAccount(value: string | null): string | null {
  if (!value) return null;
  const digits = value.trim();
  // Too short to mask meaningfully — show nothing rather than most of it.
  if (digits.length <= 4) return '••••';
  return `••••${digits.slice(-4)}`;
}

export function toPublicPayoutBatchItem(
  item: PayoutBatchItemType,
): PublicPayoutBatchItem {
  const { bankAccountNo, ...rest } = item;
  return { ...rest, bankAccountMasked: maskBankAccount(bankAccountNo) };
}

export type PublicPayoutBatch = PayoutBatchType & { items: PublicPayoutBatchItem[] };

export function toPublicPayoutBatch(batch: PayoutBatchWithItems): PublicPayoutBatch {
  return { ...batch, items: batch.items.map(toPublicPayoutBatchItem) };
}
