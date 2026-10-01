import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftAgencyTable, ShiftTable } from '@/features/shift/shift.model';
import {
  PaymentVoucherLineTable,
  PaymentVoucherReceiptTable,
  PaymentVoucherTable,
} from './payment-voucher.model';
import {
  HISTORY_LINE_COMPONENTS,
  OWED_RECEIPT_STATUSES,
  type HistoryExtrasRows,
  type HistoryWindow,
} from './history-extras';

/** A fresh copy of one WHERE clause each time — every query builds its own. */
type Where = () => SQL | undefined;

/**
 * The reads behind `GET /payment-voucher/history-extras` — FOUR set-based
 * queries whatever the number of vouchers, where the screen used to make one
 * request per voucher (each of which scanned `payment_voucher_line` for its own
 * `voucher_id`, a column with no index).
 *
 * Every read is confined to ONE agency, handed in by the controller from the
 * caller's own membership — never from the request. The SQL itself is pinned
 * by history-extras.repository.test.ts.
 *
 * Read-only. What the rows mean is decided in history-extras.ts; the filters
 * here are pushdowns of those same rules, so a year's read stays a year's read.
 */
export class HistoryExtrasRepositoryClass {
  /**
   * The PRs on the History's ledger — the users with a COMPLETED booking of
   * this agency on a shift in the window.
   *
   * Mirrors how the screen builds that ledger, by joining two lists:
   *   · `GET /shift-assignment` — scoped on `shift_assignment.agency_id`, the
   *     BOOKING's agency (a PR this agency sent to a shift another agency was
   *     also sent to is still this agency's night);
   *   · `GET /shift?fromDate&toDate` — scoped through `shift_agency`, and
   *     windowed with the very expression below. A different spelling of the
   *     day here could admit a night the screen never lists.
   */
  async listLedgerPrIds(agencyId: string, window: HistoryWindow): Promise<string[]> {
    const invitedShiftIds = db
      .select({ shiftId: ShiftAgencyTable.shiftId })
      .from(ShiftAgencyTable)
      .where(eq(ShiftAgencyTable.agencyId, agencyId));
    const rows = await db
      .selectDistinct({ prId: ShiftAssignmentTable.prId })
      .from(ShiftAssignmentTable)
      .innerJoin(ShiftTable, eq(ShiftTable.id, ShiftAssignmentTable.shiftId))
      .where(
        and(
          eq(ShiftAssignmentTable.agencyId, agencyId),
          eq(ShiftAssignmentTable.status, 'completed'),
          inArray(ShiftTable.id, invitedShiftIds),
          // Same as ShiftRepository.listPaginated's fromDate / toDate.
          sql`(${ShiftTable.shiftDate} at time zone 'Asia/Kuala_Lumpur')::date >= ${window.fromDate}::date`,
          sql`(${ShiftTable.shiftDate} at time zone 'Asia/Kuala_Lumpur')::date <= ${window.toDate}::date`,
        ),
      );
    return rows.map((r) => r.prId);
  }

  /**
   * The ledger, its candidate vouchers, and those vouchers' commission and
   * penalty lines and owed receipts.
   */
  async readRows(agencyId: string, window: HistoryWindow): Promise<HistoryExtrasRows> {
    try {
      const ledgerPrIds = await this.listLedgerPrIds(agencyId, window);
      if (ledgerPrIds.length === 0) {
        return { ledgerPrIds, vouchers: [], lines: [], receipts: [] };
      }
      const where = this.candidateVouchers(agencyId, ledgerPrIds, window);
      const [vouchers, lines, receipts] = await Promise.all([
        this.listCandidateVouchers(where),
        this.listLines(where),
        this.listOwedReceipts(where),
      ]);
      return { ledgerPrIds, vouchers, lines, receipts };
    } catch (error) {
      logger.error('[HistoryExtrasRepository.readRows] Error:', error);
      throw error;
    }
  }

  /**
   * `selectHistoryVoucherIds`' own rule, pushed down: this agency's vouchers of
   * a ledger PR whose week touches the window, or that carry no week. That
   * function re-applies it, so it stays the authority and this only keeps the
   * rows it would discard off the wire.
   */
  private candidateVouchers(agencyId: string, prIds: string[], window: HistoryWindow): Where {
    return () =>
      and(
        eq(PaymentVoucherTable.agencyId, agencyId),
        inArray(PaymentVoucherTable.prId, prIds),
        or(
          isNull(PaymentVoucherTable.weekStart),
          isNull(PaymentVoucherTable.weekEnd),
          and(
            gte(PaymentVoucherTable.weekEnd, window.fromDate),
            lte(PaymentVoucherTable.weekStart, window.toDate),
          ),
        ),
      );
  }

  private candidateIds(where: Where) {
    return db.select({ id: PaymentVoucherTable.id }).from(PaymentVoucherTable).where(where());
  }

  private listCandidateVouchers(where: Where) {
    return db
      .select({
        id: PaymentVoucherTable.id,
        prId: PaymentVoucherTable.prId,
        weekStart: PaymentVoucherTable.weekStart,
        weekEnd: PaymentVoucherTable.weekEnd,
      })
      .from(PaymentVoucherTable)
      .where(where());
  }

  /** Only the components the fold reads — it re-checks every one. */
  private listLines(where: Where) {
    return db
      .select({
        voucherId: PaymentVoucherLineTable.voucherId,
        component: PaymentVoucherLineTable.component,
        amount: PaymentVoucherLineTable.amount,
        receiptId: PaymentVoucherLineTable.receiptId,
      })
      .from(PaymentVoucherLineTable)
      .where(
        and(
          inArray(PaymentVoucherLineTable.voucherId, this.candidateIds(where)),
          inArray(PaymentVoucherLineTable.component, [...HISTORY_LINE_COMPONENTS]),
        ),
      );
  }

  /** Only receipts whose commission is owed and that name a night — the fold re-checks both. */
  private listOwedReceipts(where: Where) {
    return db
      .select({
        id: PaymentVoucherReceiptTable.id,
        voucherId: PaymentVoucherReceiptTable.voucherId,
        status: PaymentVoucherReceiptTable.status,
        shiftAssignmentId: PaymentVoucherReceiptTable.shiftAssignmentId,
      })
      .from(PaymentVoucherReceiptTable)
      .where(
        and(
          inArray(PaymentVoucherReceiptTable.voucherId, this.candidateIds(where)),
          inArray(PaymentVoucherReceiptTable.status, [...OWED_RECEIPT_STATUSES]),
          isNotNull(PaymentVoucherReceiptTable.shiftAssignmentId),
        ),
      );
  }
}
