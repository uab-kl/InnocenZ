import { z } from 'zod';
import { toCents } from './payment-voucher-balance';
import type {
  PaymentVoucherComponent,
  PaymentVoucherReceiptStatus,
} from './payment-voucher.model';

/**
 * WHAT THE AGENCY HISTORY'S TAKE-HOME NEEDS FROM THE VOUCHERS — in ONE read.
 *
 * The History screen (apps/web `use-agency-history.ts` + `history-take-home.ts`)
 * states each night's take-home as wages + approved overtime + commission, less
 * each voucher's deductions. Wages and overtime ride on the assignment rows the
 * screen already holds. Commission and the penalty lines live on voucher LINES,
 * which the list endpoint omits — so the screen used to read every relevant
 * voucher through `GET /payment-voucher/:id`, one request each ("fine at pilot
 * scale; a year of a large agency wants a server-side aggregate instead").
 *
 * This is that aggregate. The rules are the web's, ported line for line and
 * pinned against a frozen copy of the web code (history-extras.parity.test.ts):
 *
 *   selection   the vouchers of a PR on the LEDGER — a PR with a COMPLETED
 *               booking of this agency on a shift in the window — whose week
 *               overlaps the window, or that carry no week at all
 *   commission  per assignment: `drink_commission` + `tip_commission` lines (an
 *               ALLOW-list — wages, ot, deduction, other and an unclassified
 *               line never count) whose receipt is on the SAME voucher, names
 *               its assignment, and is approved or verified
 *   penalty     per voucher: the negated sum of its `deduction` lines — a
 *               cancellation fee or a weekly penalty, written negative
 *
 * Integer SEN throughout: many RM figures summed into one headline drift by a
 * sen in floating point, and `toCents` reads the numeric(12,2) string exactly.
 *
 * Pure on purpose — the repository reads the rows, this decides what they mean,
 * so the rules can be tested without a database.
 */

/** Commission is these two components and nothing else. */
export const HISTORY_COMMISSION_COMPONENTS = [
  'drink_commission',
  'tip_commission',
] as const satisfies readonly PaymentVoucherComponent[];

/** A penalty line: a cancellation fee or a weekly penalty (penalty-line.ts). */
export const HISTORY_PENALTY_COMPONENT =
  'deduction' as const satisfies PaymentVoucherComponent;

/**
 * Every component the fold reads. The repository narrows its line read to these
 * — a pushdown only: the fold re-checks every rule, so a line outside the list
 * would be skipped here anyway.
 */
export const HISTORY_LINE_COMPONENTS = [
  ...HISTORY_COMMISSION_COMPONENTS,
  HISTORY_PENALTY_COMPONENT,
] as const;

/**
 * The receipt statuses whose commission is owed — the report's gate
 * (`reportCostByPrDay`) and `recomputeShiftSale`'s. A pending receipt has raised
 * neither revenue nor commission yet.
 */
export const OWED_RECEIPT_STATUSES = [
  'approved',
  'verified',
] as const satisfies readonly PaymentVoucherReceiptStatus[];

/**
 * The widest window one read may cover, in days between the two dates. The
 * History asks for a year (`HISTORY_LOOKBACK_DAYS = 365`); one day of slack, and
 * no more, so a caller cannot turn this into a read of an agency's whole past.
 */
export const MAX_HISTORY_WINDOW_DAYS = 366;

const DAY_MS = 86_400_000;

/**
 * The days a window may name. `0000-01-01` is a real day to JavaScript and not
 * to Postgres (there is no year 0), so without a floor it would reach the
 * `::date` cast and answer 500 instead of 400. Nothing on this platform
 * predates 2000.
 */
const EARLIEST_DAY = '2000-01-01';
const LATEST_DAY = '2100-12-31';

/** `YYYY-MM-DD` that is a real calendar day — `2026-02-31` matches the pattern but is not one. */
const IsoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine(
    (v) => {
      const at = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === v;
    },
    { message: 'Not a real date' },
  )
  .refine((v) => v >= EARLIEST_DAY && v <= LATEST_DAY, {
    message: `Dates must fall between ${EARLIEST_DAY} and ${LATEST_DAY}`,
  });

function dayNumber(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
}

/** `?fromDate=&toDate=` — both required, both inclusive, at most a year apart. */
export const HistoryExtrasQuerySchema = z
  .object({ fromDate: IsoDay, toDate: IsoDay })
  .refine((q) => q.fromDate <= q.toDate, {
    message: 'fromDate must not be after toDate',
  })
  .refine(
    (q) => dayNumber(q.toDate) - dayNumber(q.fromDate) <= MAX_HISTORY_WINDOW_DAYS,
    { message: `The window may span at most ${MAX_HISTORY_WINDOW_DAYS} days` },
  );

export type HistoryWindow = z.infer<typeof HistoryExtrasQuerySchema>;

/** A voucher as the selection needs it. */
export type HistoryVoucherRow = {
  id: string;
  prId: string | null;
  weekStart: string | null;
  weekEnd: string | null;
};

/** A line as the fold needs it. `amount` is numeric(12,2) — a string off the driver. */
export type HistoryLineRow = {
  voucherId: string;
  component: PaymentVoucherComponent | null;
  amount: string;
  receiptId: string | null;
};

/** A receipt as the fold needs it. */
export type HistoryReceiptRow = {
  id: string;
  voucherId: string;
  status: PaymentVoucherReceiptStatus;
  shiftAssignmentId: string | null;
};

/** Everything the repository reads for one agency and one window. */
export type HistoryExtrasRows = {
  /** Users with a COMPLETED booking of this agency on a shift in the window. */
  ledgerPrIds: string[];
  vouchers: HistoryVoucherRow[];
  lines: HistoryLineRow[];
  receipts: HistoryReceiptRow[];
};

export interface HistoryExtrasAssignment {
  assignmentId: string;
  drinkCommissionSen: number;
  tipCommissionSen: number;
}

export interface HistoryExtrasVoucher {
  voucherId: string;
  /** The voucher's penalty lines as a POSITIVE figure, in sen. 0 when it has none. */
  penaltySen: number;
}

export interface HistoryExtras {
  /** Assignments with at least one counted commission line — absent means none. */
  assignments: HistoryExtrasAssignment[];
  /** EVERY selected voucher, so a reader can tell "read, no penalty" from "not read". */
  vouchers: HistoryExtrasVoucher[];
}

/** A stored date's calendar day — tolerant of a timestamp-shaped string. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The vouchers whose lines the take-home needs, sorted by id.
 *
 * A voucher outside this set cannot hold a listed night's receipt or count
 * toward a listed week's deductions, so leaving it unread loses nothing. A
 * voucher with no week is kept: nothing says which nights its receipts are for.
 */
export function selectHistoryVoucherIds(
  vouchers: readonly HistoryVoucherRow[],
  ledgerPrIds: ReadonlySet<string>,
  window: HistoryWindow,
): string[] {
  return vouchers
    .filter((v) => {
      if (!v.prId || !ledgerPrIds.has(v.prId)) return false;
      if (!v.weekStart || !v.weekEnd) return true;
      return (
        dayOf(v.weekEnd) >= window.fromDate &&
        dayOf(v.weekStart) <= window.toDate
      );
    })
    .map((v) => v.id)
    .sort();
}

function isOwed(status: string): boolean {
  return (OWED_RECEIPT_STATUSES as readonly string[]).includes(status);
}

/** Each selected voucher's OWN receipts, by id — a line is credited through no other. */
function receiptsByVoucher(
  receipts: readonly HistoryReceiptRow[],
  selected: ReadonlySet<string>,
): Map<string, Map<string, HistoryReceiptRow>> {
  const out = new Map<string, Map<string, HistoryReceiptRow>>();
  for (const r of receipts) {
    if (!selected.has(r.voucherId)) continue;
    const own = out.get(r.voucherId) ?? new Map<string, HistoryReceiptRow>();
    own.set(r.id, r);
    out.set(r.voucherId, own);
  }
  return out;
}

/**
 * Commission per assignment and penalty per voucher, over the selected vouchers.
 *
 * A line whose receipt is not on the voucher it sits on is skipped rather than
 * guessed at, as is a receipt that names no assignment or is still pending.
 * Rows of vouchers outside `voucherIds` are ignored whatever they carry.
 */
export function foldHistoryExtras(input: {
  voucherIds: readonly string[];
  lines: readonly HistoryLineRow[];
  receipts: readonly HistoryReceiptRow[];
}): HistoryExtras {
  const selected = new Set(input.voucherIds);
  const receipts = receiptsByVoucher(input.receipts, selected);
  const commission = new Map<string, { drink: number; tip: number }>();
  const deductionSen = new Map<string, number>();

  for (const line of input.lines) {
    if (!selected.has(line.voucherId)) continue;
    if (line.component === HISTORY_PENALTY_COMPONENT) {
      deductionSen.set(
        line.voucherId,
        (deductionSen.get(line.voucherId) ?? 0) + toCents(line.amount),
      );
      continue;
    }
    const isDrink = line.component === 'drink_commission';
    const isTip = line.component === 'tip_commission';
    if ((!isDrink && !isTip) || !line.receiptId) continue;
    const receipt = receipts.get(line.voucherId)?.get(line.receiptId);
    if (!receipt?.shiftAssignmentId) continue;
    if (!isOwed(receipt.status)) continue;
    const cur = commission.get(receipt.shiftAssignmentId) ?? { drink: 0, tip: 0 };
    const amount = toCents(line.amount);
    commission.set(receipt.shiftAssignmentId, {
      drink: cur.drink + (isDrink ? amount : 0),
      tip: cur.tip + (isTip ? amount : 0),
    });
  }

  return {
    assignments: [...commission.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([assignmentId, c]) => ({
        assignmentId,
        drinkCommissionSen: c.drink,
        tipCommissionSen: c.tip,
      })),
    // `0 - total`, not `-total`: a voucher with no penalty is 0, never -0.
    vouchers: [...selected].sort().map((voucherId) => ({
      voucherId,
      penaltySen: 0 - (deductionSen.get(voucherId) ?? 0),
    })),
  };
}

/** Selection, then the fold — what the endpoint answers. */
export function computeHistoryExtras(
  rows: HistoryExtrasRows,
  window: HistoryWindow,
): HistoryExtras {
  const voucherIds = selectHistoryVoucherIds(
    rows.vouchers,
    new Set(rows.ledgerPrIds),
    window,
  );
  return foldHistoryExtras({
    voucherIds,
    lines: rows.lines,
    receipts: rows.receipts,
  });
}
