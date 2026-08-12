import type { AgencyPenaltyRule } from '@/features/agency/agency-penalty-rule.model.js';

/**
 * What cancelling a shift costs, computed at the moment of cancelling.
 *
 * This is the server's copy of the arithmetic the PR app shows on the Cancel
 * button (apps/mobile AgencySchedulePanel `cancelPenalty`). The two must agree
 * exactly — a PR who is shown -RM 27.50 and sealed at -RM 41.25 has been lied
 * to — so the band boundaries, the rounding and the disabled case are all
 * mirrored deliberately rather than re-invented.
 *
 * The result is SEALED onto the assignment. It is never recomputed later: the
 * agency's bands are editable, and re-deriving in November would restate what
 * was owed for a shift dropped in August.
 */
export type CancelFee = {
  /** RM, 2dp string ready for the numeric column. '0.00' when nothing is due. */
  feeRm: string;
  /** The band that applied — 0 when free or when the rule is off. */
  pct: number;
  /** Notice given, in hours. Negative when the shift had already started. */
  noticeHours: string;
};

/** Parse a shift's start from its date + slot ("22:00 - 04:00" -> 22:00). */
export function shiftStartMs(shiftDate: string, slot: string | null): number {
  const [y, m, d] = shiftDate.split('-').map(Number);
  const match = slot?.match(/(\d{1,2}):(\d{2})/);
  return new Date(
    y ?? 1970,
    (m ?? 1) - 1,
    d ?? 1,
    match ? Number(match[1]) : 0,
    match ? Number(match[2]) : 0,
    0,
    0,
  ).getTime();
}

export function computeCancelFee(opts: {
  rule: AgencyPenaltyRule | null | undefined;
  /** The shift's forecast daily wage — `shift_assignment.pay_amount`. */
  dailyWageRm: string | number | null | undefined;
  shiftDate: string;
  slot: string | null;
  now?: Date;
}): CancelFee {
  const now = opts.now ?? new Date();
  const noticeHours =
    (shiftStartMs(opts.shiftDate, opts.slot) - now.getTime()) / 3_600_000;
  const hours = noticeHours.toFixed(2);

  const rule = opts.rule;
  // No rule row, or the agency switched it off -> no fee. NOT "0% of the
  // bands": an agency that does not charge for cancellations must not have a
  // RM 0.00 line appear on a Finance list as though something were outstanding.
  if (!rule || !rule.enabled) return { feeRm: '0.00', pct: 0, noticeHours: hours };

  const free = rule.freeCancelHours;
  const short = rule.shortNoticeHours;
  if (free != null && noticeHours >= free) {
    return { feeRm: '0.00', pct: 0, noticeHours: hours };
  }

  // A half-configured rule must not silently price at the late band. A missing
  // boundary means the agency has not defined that band, so nothing is due.
  const pct =
    short != null && noticeHours >= short ? rule.shortNoticePct : rule.lateCancelPct;
  if (pct == null || pct <= 0) return { feeRm: '0.00', pct: 0, noticeHours: hours };

  const wage = Number(opts.dailyWageRm ?? 0);
  if (!Number.isFinite(wage) || wage <= 0) {
    // A shift with no forecast wage has no base to charge against. Record the
    // band so the row still explains itself, but claim no money.
    return { feeRm: '0.00', pct, noticeHours: hours };
  }

  // Same rounding as the PR app: round the ringgit-cents product, not the
  // ringgit. `Math.round(wage * pct) / 100` on 55 x 50 gives exactly 27.50.
  const feeRm = (Math.round(wage * pct) / 100).toFixed(2);
  return { feeRm, pct, noticeHours: hours };
}
