import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  PaymentVoucherComponent,
  PaymentVoucherDisputeComponent,
  PaymentVoucherDisputeTable,
  PaymentVoucherLineTable,
} from './payment-voucher.model.js';

export type PaymentVoucherDispute = typeof PaymentVoucherDisputeTable.$inferSelect;
export type PaymentVoucherDisputeInsert = typeof PaymentVoucherDisputeTable.$inferInsert;

/** Postgres unique_violation — the one-per-day-per-component constraint firing. */
const UNIQUE_VIOLATION = '23505';

export class DuplicateDisputeError extends Error {
  constructor() {
    super('A dispute for this day and component already exists');
    this.name = 'DuplicateDisputeError';
  }
}

/**
 * A dispute names a coarse bucket (`wages | drinks | tips | others`) but a
 * voucher LINE carries the finer `payment_voucher_component`. The two
 * vocabularies are deliberately different — the PR app speaks in receipt kinds,
 * the ledger distinguishes overtime and deductions — so the mapping is explicit
 * rather than assumed equal.
 *
 * `ot` and `deduction` fall under 'others': overtime is logged on the phone with
 * kind 'others', and a deduction is not something the other three buckets can
 * describe. NULL components are legacy rows that predate classification; they
 * count under 'others' too, since leaving them uncountable would make a dispute
 * on an old voucher silently value at zero.
 */
const LINE_COMPONENTS_FOR: Readonly<
  Record<PaymentVoucherDisputeComponent, PaymentVoucherComponent[]>
> = {
  wages: ['wages'],
  drinks: ['drink_commission'],
  tips: ['tip_commission'],
  others: ['other', 'ot', 'deduction'],
};

export class PaymentVoucherDisputeRepositoryClass {
  /**
   * What the voucher currently says for one day + component, summed from its
   * lines.
   *
   * This is the baseline of a money claim, so it is computed here and never
   * accepted from the caller. Returns a fixed-2 string to match the numeric
   * column rather than carrying float error into a ledger.
   */
  async sumLinesFor(
    voucherId: string,
    disputeDate: string,
    component: PaymentVoucherDisputeComponent,
  ): Promise<string> {
    try {
      const wanted = LINE_COMPONENTS_FOR[component];
      const rows = await db
        .select({
          amount: PaymentVoucherLineTable.amount,
          component: PaymentVoucherLineTable.component,
        })
        .from(PaymentVoucherLineTable)
        .where(
          and(
            eq(PaymentVoucherLineTable.voucherId, voucherId),
            eq(PaymentVoucherLineTable.lineDate, disputeDate),
          ),
        );

      const total = rows
        .filter((r) => (r.component === null ? component === 'others' : wanted.includes(r.component)))
        .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

      return total.toFixed(2);
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.sumLinesFor] Error:', error);
      return '0.00';
    }
  }

  /**
   * Inserts a dispute. Throws DuplicateDisputeError when the day+component is
   * already disputed — the DB's UNIQUE constraint is the arbiter, not a
   * read-then-write check, which two concurrent taps would slip straight past.
   */
  async create(input: PaymentVoucherDisputeInsert): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db.insert(PaymentVoucherDisputeTable).values(input).returning();
      return row ?? null;
    } catch (error) {
      if ((error as { code?: string })?.code === UNIQUE_VIOLATION) {
        throw new DuplicateDisputeError();
      }
      logger.error('[PaymentVoucherDisputeRepository.create] Error:', error);
      return null;
    }
  }

  async listForVoucher(voucherId: string): Promise<PaymentVoucherDispute[]> {
    try {
      return await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(eq(PaymentVoucherDisputeTable.voucherId, voucherId));
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.listForVoucher] Error:', error);
      return [];
    }
  }

  /** Open = still awaiting agency review, i.e. no outcome recorded yet. */
  async listOpenForVoucher(voucherId: string): Promise<PaymentVoucherDispute[]> {
    try {
      return await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(
          and(
            eq(PaymentVoucherDisputeTable.voucherId, voucherId),
            isNull(PaymentVoucherDisputeTable.outcome),
          ),
        );
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.listOpenForVoucher] Error:', error);
      return [];
    }
  }

  /**
   * The still-open dispute on one day + component, if any. This is how the PR
   * app addresses a withdraw — it points at the grid cell it tapped, not at an
   * id it would otherwise have to track.
   */
  async findOpen(
    voucherId: string,
    disputeDate: string,
    component: PaymentVoucherDisputeComponent,
  ): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(
          and(
            eq(PaymentVoucherDisputeTable.voucherId, voucherId),
            eq(PaymentVoucherDisputeTable.disputeDate, disputeDate),
            eq(PaymentVoucherDisputeTable.component, component),
            isNull(PaymentVoucherDisputeTable.outcome),
          ),
        );
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.findOpen] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentVoucherDisputeTable)
        .where(eq(PaymentVoucherDisputeTable.id, id));
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.getById] Error:', error);
      return null;
    }
  }

  /**
   * Withdraws one open dispute.
   *
   * `isNull(outcome)` is part of the WHERE so a dispute the agency has already
   * decided cannot be retracted afterwards — that would rewrite the outcome of a
   * money decision. Returns null when nothing matched.
   */
  async withdraw(id: string, actor: string): Promise<PaymentVoucherDispute | null> {
    try {
      const [row] = await db
        .update(PaymentVoucherDisputeTable)
        .set({
          outcome: 'withdrawn',
          resolvedAt: new Date(),
          resolvedBy: actor,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(eq(PaymentVoucherDisputeTable.id, id), isNull(PaymentVoucherDisputeTable.outcome)),
        )
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.withdraw] Error:', error);
      return null;
    }
  }

  /** Confirms the disputed day is one the voucher actually covers. */
  async voucherHasDate(voucherId: string, disputeDate: string): Promise<boolean> {
    try {
      const rows = await db
        .select({ id: PaymentVoucherLineTable.id })
        .from(PaymentVoucherLineTable)
        .where(
          and(
            eq(PaymentVoucherLineTable.voucherId, voucherId),
            eq(PaymentVoucherLineTable.lineDate, disputeDate),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      logger.error('[PaymentVoucherDisputeRepository.voucherHasDate] Error:', error);
      return false;
    }
  }
}
