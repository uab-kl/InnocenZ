import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { PaymentVoucherTable } from '@/features/payment-voucher/payment-voucher.model';

/**
 * The roster card's two live numbers — attendance and money actually paid.
 *
 * A LEAF module on purpose: it imports the two MODELS and nothing else, so the
 * PR controller can enrich its list without pulling the shift-assignment or
 * payment-voucher repositories into its import graph (a latent cycle took the
 * whole agency portal down once).
 *
 * Both figures are AGENCY-SCOPED. One person holds an `agency_pr` row per
 * agency, so a PR on two rosters has two separate attendance records and two
 * separate payment histories; querying without the agency predicate would show
 * each agency the other's numbers. `shift_assignment.agency_id` and
 * `payment_voucher.agency_id` are the scoping keys, and neither is optional for
 * any caller that is not an admin.
 */

/** The assignment status that counts as a shift kept. */
const ATTENDANCE_KEPT = 'completed';
/** Counted against the PR: a no-show, and a shift they cancelled on. */
const ATTENDANCE_MISSED = ['no_show', 'cancelled'] as const;
/** Approved MC/leave — never a miss, never a kept shift. */
const ATTENDANCE_EXCUSED = 'leave_approved';

export interface PrStats {
  /**
   * Kept shifts as a percentage of concluded ones, 0–100 — or `null` when the
   * PR has no concluded shift yet.
   *
   * `null` is NOT 0. A PR who has never been scheduled has no attendance record,
   * and printing "0%" on their card accuses them of missing shifts that were
   * never offered — the same mistake `rating: 0` made before an unrated PR was
   * given its own spelling. The web renders this as an em-dash.
   */
  attendancePct: number | null;
  completedShifts: number;
  /** No-shows plus PR cancellations: the shifts that count against them. */
  missedShifts: number;
  /** Approved MC/leave — excluded from the percentage entirely. */
  excusedShifts: number;
  /**
   * Money the agency has actually PAID this PR: the sum of `net` over vouchers
   * in status `paid`.
   *
   * Deliberately not "earned". A sealed wage on a completed shift is a debt, not
   * a payment, and a voucher sitting at `sent` or `signed` has moved no money —
   * counting either would report a PR as paid for work the agency has not
   * settled. RM 0 here means "nothing marked paid yet", which is a true
   * statement about the ledger rather than a placeholder.
   */
  totalPaidRm: number;
}

const EMPTY_STATS: PrStats = {
  attendancePct: null,
  completedShifts: 0,
  missedShifts: 0,
  excusedShifts: 0,
  totalPaidRm: 0,
};

/** Kept ÷ concluded, rounded — `null` when nothing has concluded. */
function toAttendancePct(completed: number, missed: number): number | null {
  const concluded = completed + missed;
  if (concluded === 0) return null;
  return Math.round((completed / concluded) * 100);
}

/**
 * Attendance + paid totals for a page of PRs, keyed by user id.
 *
 * Two grouped queries for the whole page, never one per PR — the roster asks for
 * up to 500 rows at a time, and an N+1 here would be a thousand round trips per
 * screen.
 *
 * `agencyId: null` is ADMIN scope (every agency's rows). Every other caller must
 * pass its own agency id. A PR absent from the result simply has no history, and
 * callers fall back to `EMPTY_PR_STATS`.
 *
 * Fails soft: a broken aggregate returns empty stats rather than 500-ing the
 * roster. The card then degrades to "—" / RM 0, which is what it showed before
 * this existed; taking the whole PR list down to render a metric would be worse.
 */
export async function loadPrStats(params: {
  prIds: string[];
  agencyId: string | null;
}): Promise<Map<string, PrStats>> {
  const { prIds, agencyId } = params;
  const stats = new Map<string, PrStats>();
  if (prIds.length === 0) return stats;

  const ids = [...new Set(prIds)];

  try {
    // `pr_id` IS the user id after 0089 (the column kept its old name), and that
    // is also `PrWithProfileType.id` — so this groups on the very key the caller
    // looks results up by. Grouping on `user_id` instead would drop the rows
    // predating the dual-write, where that column is still null.
    const attendanceRows = await db
      .select({
        prId: ShiftAssignmentTable.prId,
        completed: sql<number>`count(*) filter (where ${ShiftAssignmentTable.status} = ${ATTENDANCE_KEPT})::int`,
        missed: sql<number>`count(*) filter (where ${ShiftAssignmentTable.status} in (${sql.join(
          ATTENDANCE_MISSED.map((status) => sql`${status}`),
          sql`, `,
        )}))::int`,
        excused: sql<number>`count(*) filter (where ${ShiftAssignmentTable.status} = ${ATTENDANCE_EXCUSED})::int`,
      })
      .from(ShiftAssignmentTable)
      .where(
        and(
          inArray(ShiftAssignmentTable.prId, ids),
          ...(agencyId ? [eq(ShiftAssignmentTable.agencyId, agencyId)] : []),
        ),
      )
      .groupBy(ShiftAssignmentTable.prId);

    for (const row of attendanceRows) {
      const completed = Number(row.completed ?? 0);
      const missed = Number(row.missed ?? 0);
      stats.set(row.prId, {
        ...EMPTY_STATS,
        completedShifts: completed,
        missedShifts: missed,
        excusedShifts: Number(row.excused ?? 0),
        attendancePct: toAttendancePct(completed, missed),
      });
    }
  } catch (error) {
    logger.error('[loadPrStats] attendance aggregate failed:', error);
  }

  try {
    // The payee key is `user_id` where the remap landed and `pr_id` on older
    // rows; both hold the same value when set, so COALESCE resolves one payee
    // regardless of which column a given voucher carries.
    const payee = sql<string>`coalesce(${PaymentVoucherTable.userId}, ${PaymentVoucherTable.prId})`;
    const paidRows = await db
      .select({
        payee,
        // numeric arrives as a string from the driver; cast so the sum is a
        // number here and cannot be string-concatenated downstream.
        paid: sql<number>`coalesce(sum(${PaymentVoucherTable.net}), 0)::float8`,
      })
      .from(PaymentVoucherTable)
      .where(
        and(
          inArray(payee, ids),
          eq(PaymentVoucherTable.status, 'paid'),
          ...(agencyId ? [eq(PaymentVoucherTable.agencyId, agencyId)] : []),
        ),
      )
      .groupBy(payee);

    for (const row of paidRows) {
      if (!row.payee) continue;
      const current = stats.get(row.payee) ?? { ...EMPTY_STATS };
      stats.set(row.payee, { ...current, totalPaidRm: Number(row.paid ?? 0) });
    }
  } catch (error) {
    logger.error('[loadPrStats] paid aggregate failed:', error);
  }

  return stats;
}

export { EMPTY_STATS as EMPTY_PR_STATS };
