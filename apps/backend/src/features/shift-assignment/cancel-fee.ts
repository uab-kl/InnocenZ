import type { AgencyPenaltyRule } from '@/features/agency/agency-penalty-rule.model.js';
import { shiftWindowInstants } from '@/util/slot-window.js';

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

/**
 * A shift's start as a real instant, read in the VENUE's timezone.
 *
 * ⚠️ THIS BUILT THE DATE WITH `new Date(y, m, d, hh, mm)` — the local-time
 * constructor, which resolves the wall clock in the SERVER process's timezone.
 * On a UTC container a 22:00 Kuala Lumpur shift was read as 22:00Z, eight hours
 * late, so every cancellation looked eight hours earlier than it was: notice
 * hours inflated and the fee fell a band, or to nothing. That wrong figure is
 * then SEALED onto the assignment and never recomputed.
 *
 * `slot-window.ts` exists to end exactly this failure — its own header says
 * "Never build this with `new Date(y, m, d, hh, mm)`… on a UTC host a
 * 20:00–02:00 Kuala Lumpur shift lands eight hours late" — and cites the wage
 * incident where the same drift paid a fully-worked shift RM0.00. Cancel-fee was
 * the one money path that never adopted it. It also carried its OWN slot parser,
 * a lone `/(\d{1,2}):(\d{2})/`, which is the second parser `slotMinutes` was
 * consolidated to remove: it read "8pm - 2am" as midnight.
 *
 * Null when the slot carries no readable window ("Late night") or the date is
 * unusable — "no schedule", which callers must not treat as a zero window. The
 * old code could not express that and returned a 1970 midnight instead, pricing
 * such a shift at the maximum late band.
 */
export function shiftStartMs(shiftDate: string, slot: string | null): number | null {
  return shiftWindowInstants(shiftDate, slot)?.start.getTime() ?? null;
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
  const startMs = shiftStartMs(opts.shiftDate, opts.slot);
  // NO READABLE SCHEDULE, NO FEE. A slot this cannot parse ("Late night") or an
  // unusable date leaves nothing to measure notice against, and a fee is a
  // deduction from someone's pay — it must rest on a window we can actually
  // name. The old parser could not express "unknown": it fell back to a 1970
  // midnight, which is maximally in the past and therefore priced every such
  // cancellation at the LATE band.
  if (startMs === null) {
    return { feeRm: '0.00', pct: 0, noticeHours: '0.00' };
  }
  const noticeHours = (startMs - now.getTime()) / 3_600_000;
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
