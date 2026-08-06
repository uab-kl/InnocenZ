import { toCents, formatCents } from '@/features/payment-voucher/payment-voucher-balance';

/**
 * How much of the day rate a shift actually EARNED, from the attendance stamps.
 *
 * Pure, for the same reason `overtime.ts` is: this decides money, so it has to be
 * checkable by calling it with two dates rather than by working a night shift.
 *
 * ## The rule (owner's decision, 6 Aug 2026)
 *
 * The day rate is **not guaranteed for showing up** — it is earned by working the
 * full shift. Pay is therefore `day rate × minutes worked ÷ minutes scheduled`,
 * by the minute with no rounding of time, capped at the full day rate.
 *
 * Before this, `payAmount` sealed FLAT at the tier rate and never once consulted
 * `checkInAt` / `checkOutAt`: a PR who left three hours early was paid in full,
 * and the check-out clamp could only ever ADD to pay (via overtime), never
 * subtract. That overpayment lived on the ordinary self-checkout path, not in any
 * release-early feature — which is why the rule belongs HERE, in the seal both
 * paths share, rather than inside a feature only one of them goes through.
 *
 * ## Why the divisor is the SHIFT WINDOW, not `STANDARD_SHIFT_HOURS`
 *
 * The rate card carries a standard-shift length (6h) and overtime is priced
 * against it, but pay cannot be. A venue that books an 8-hour night and pays one
 * day rate for it must pay that rate for 8 hours worked — divide by 6 and a full
 * shift bills 133% — and a PR who leaves after 6 of those 8 hours must NOT come
 * out at the full rate. The window is already the operative "full shift"
 * everywhere else besides: it is where the clamp stops and where overtime begins.
 *
 * ## What is deliberately NOT here
 *
 * No penalty, of any kind. Being paid for the hours you worked is the wage rule;
 * charging someone for leaving early is a separate decision needing amounts this
 * system does not yet hold. Nor does this care WHY the PR left — released by the
 * outlet or gone of their own accord produce the identical stamp, and the reason
 * code telling them apart is the penalty half's problem, not this one's.
 */

/** Minutes of shortfall forgiven outright, per the owner: "around 1-5 minutes". */
export const WAGE_GRACE_MINUTES = 5;

export type WageRule =
  /** Worked the whole window (or more) — the full day rate. */
  | 'full_day'
  /** Short by no more than the grace — rounded up to the full day rate. */
  | 'grace'
  /** Short by more than the grace — paid by the minute. */
  | 'pro_rata'
  /** The slot carries no parseable window, so there is nothing to pro-rate against. */
  | 'no_schedule'
  /** The stamps put the PR entirely outside their own shift window. */
  | 'never_present';

export type EarnedWage = {
  /**
   * What to seal on the assignment, as a fixed(2) string — or null when nothing
   * may be sealed at all (a commission-only PR has no day rate, and inventing a
   * 0.00 for them would read as "we paid you nothing for this shift").
   */
  amount: string | null;
  /** The full day rate this came from — the basis overtime stays priced on. */
  dayRate: string | null;
  workedMinutes: number | null;
  scheduledMinutes: number | null;
  rule: WageRule;
};

const NOTHING_TO_SEAL: EarnedWage = {
  amount: null,
  dayRate: null,
  workedMinutes: null,
  scheduledMinutes: null,
  rule: 'no_schedule',
};

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

export function earnedWage(input: {
  /** The tier rate resolved for this PR at this outlet, or null when there is none. */
  dayRate: string | null;
  /** The shift's scheduled window as real instants. Null = free-text slot. */
  scheduled: { start: Date; end: Date } | null;
  checkInAt: Date;
  /** The check-out stamp AFTER the forgot-to-check-out clamp has been applied. */
  checkOutAt: Date;
}): EarnedWage {
  const { dayRate, scheduled, checkInAt, checkOutAt } = input;
  if (dayRate == null) return NOTHING_TO_SEAL;

  let dayRateCents: number;
  try {
    dayRateCents = toCents(dayRate);
  } catch {
    return NOTHING_TO_SEAL;
  }
  if (dayRateCents <= 0) return NOTHING_TO_SEAL;

  // No window means no divisor. Pay the full rate rather than invent one — the
  // convention the clamp already follows ("an unparseable slot means no clamp"),
  // and the safe direction: a venue whose slot is free text should not find that
  // out by underpaying everyone who works there.
  const scheduledMinutes = scheduled ? minutesBetween(scheduled.start, scheduled.end) : 0;
  if (!scheduled || scheduledMinutes <= 0) {
    return {
      amount: dayRate,
      dayRate,
      workedMinutes: null,
      scheduledMinutes: null,
      rule: 'no_schedule',
    };
  }

  // Only time INSIDE the window is paid time. Clamping both ends is what makes a
  // late arrival cost the same as an early departure — they are one rule, "hours
  // you were actually on the shift" — and it stops an early arrival earning more
  // than a day.
  const workedFrom = checkInAt > scheduled.start ? checkInAt : scheduled.start;
  const workedTo = checkOutAt < scheduled.end ? checkOutAt : scheduled.end;
  const workedMinutes = Math.max(0, minutesBetween(workedFrom, workedTo));
  const shortfall = scheduledMinutes - workedMinutes;

  if (shortfall <= 0) {
    return { amount: dayRate, dayRate, workedMinutes, scheduledMinutes, rule: 'full_day' };
  }
  // The grace is measured on the TOTAL shortfall, not on each end separately, so
  // three minutes late plus three minutes early is six minutes short — not two
  // separate forgivable slips. Anything inside it rounds up to a full day.
  if (shortfall <= WAGE_GRACE_MINUTES) {
    return { amount: dayRate, dayRate, workedMinutes, scheduledMinutes, rule: 'grace' };
  }
  // The stamps do not overlap the shift at all — the state that billed assignment
  // `6574b2ee` a full day for twelve seconds of attendance on a slot that had
  // closed four hours earlier. Zero is the honest figure, and the caller logs it
  // loudly: a silent 0.00 is the one outcome here worth interrupting someone
  // over. The wage stays disputable either way.
  if (workedMinutes === 0) {
    return { amount: '0.00', dayRate, workedMinutes, scheduledMinutes, rule: 'never_present' };
  }

  const earnedCents = Math.round((dayRateCents * workedMinutes) / scheduledMinutes);
  return {
    amount: formatCents(Math.min(earnedCents, dayRateCents)),
    dayRate,
    workedMinutes,
    scheduledMinutes,
    rule: 'pro_rata',
  };
}

/** "4h12m of 6h00m" — the human half of a pro-rated line, for a voucher description. */
export function describeWorkedTime(workedMinutes: number, scheduledMinutes: number): string {
  const asHm = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
  return `${asHm(workedMinutes)} of ${asHm(scheduledMinutes)}`;
}
