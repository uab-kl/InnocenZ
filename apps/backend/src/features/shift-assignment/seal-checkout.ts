import { shiftWindowInstants } from '@/util/slot-window';
import { overtimeFromStamps, OvertimeClaim } from './overtime';
import { earnedWage, EarnedWage, WageRule } from './wage';

/**
 * Closing a shift: the clamp, the overtime claim and the wage, computed once.
 *
 * 🔴 THE POINT OF THIS MODULE. A shift can be closed two ways — the PR taps out,
 * or an approved cut-loss releases them early — and both must produce the same
 * money for the same hours. Written twice they drift: the earlier analysis of
 * this feature warned that building pro-rata inside a release-early flow would
 * leave the ordinary self-checkout path still paying a full day, "two paths,
 * different money, same hours". So the rule lives here and both callers pass
 * through it. A release is then only a REASON CODE on an otherwise identical
 * close, which is exactly what makes it cheap and safe to add.
 *
 * Pure: no DB, no clock of its own, no request. `now` is passed in so a probe can
 * walk a shift past midnight without waiting for one.
 */

export type CheckOutSeal = {
  /** The stamp to write — `now`, clamped back to the scheduled end when late. */
  checkOutAt: Date;
  /** The shift's scheduled window, or null for a free-text slot. */
  scheduled: { start: Date; end: Date } | null;
  overtime: OvertimeClaim;
  earned: EarnedWage;
  /**
   * The column changes this close implies, ready to spread into a repository
   * update. Callers add their own extras (a device fix, release provenance);
   * everything that decides MONEY is here and nowhere else.
   */
  columns: {
    checkOutAt: Date;
    status: 'completed';
    overtimeMinutes?: number;
    overtimeStatus?: 'pending';
    payAmount?: string;
    dayRateAmount?: string | null;
    workedMinutes?: number | null;
    scheduledMinutes?: number | null;
    payRule?: WageRule;
  };
};

export function sealCheckOut(input: {
  checkInAt: Date;
  /** The shift's own date (yyyy-MM-dd) and free-text slot. */
  shiftDate: string | null;
  slot: string | null;
  /** The tier rate resolved for this PR here; null for a commission-only PR. */
  dayRate: string | null;
  now: Date;
}): CheckOutSeal {
  const { checkInAt, shiftDate, slot, dayRate, now } = input;

  // Read in the VENUE's timezone — see shiftWindowInstants. ONE window decides
  // both where the clamp stops and what the wage is pro-rated against; they must
  // be the same window, or the two disagree about when the shift ended.
  const scheduled = shiftDate ? shiftWindowInstants(shiftDate, slot) : null;
  const scheduledEnd = scheduled?.end ?? null;

  // Forgot-to-check-out guard: a late stamp is CLAMPED to the scheduled end, so
  // pay locks to the shift's own duration and hours past the window only ever
  // count once the agency approves overtime. Never clamps below the check-in
  // stamp — a PR who started late still closes with a forward duration.
  const checkOutAt =
    scheduledEnd && now > scheduledEnd && scheduledEnd > checkInAt ? scheduledEnd : now;

  // RECORD the overtime before the clamp destroys the evidence for it: after the
  // write the row no longer knows when the PR actually stopped.
  const overtime = overtimeFromStamps(checkInAt, scheduledEnd, now);

  // Priced off the CLAMPED stamp so a forgotten check-out cannot buy time past
  // the window twice — the clamp caps it, and anything beyond is overtime.
  const earned = earnedWage({ dayRate, scheduled, checkInAt, checkOutAt });

  return {
    checkOutAt,
    scheduled,
    overtime,
    earned,
    columns: {
      checkOutAt,
      status: 'completed',
      // NULL status means "no overtime on this shift" — the overwhelming
      // majority of rows — so both are written only for a real claim. `pending`
      // is the only state a close may set: a shift that sealed itself approved
      // would be authorising its own pay.
      ...(overtime.minutes != null
        ? { overtimeMinutes: overtime.minutes, overtimeStatus: 'pending' as const }
        : {}),
      // The amount and its evidence go together or not at all: an amount without
      // its divisor is a figure nobody can check, and `dayRateAmount` is what
      // keeps overtime priced off the full rate after `payAmount` is reduced.
      ...(earned.amount != null
        ? {
            payAmount: earned.amount,
            dayRateAmount: earned.dayRate,
            workedMinutes: earned.workedMinutes,
            scheduledMinutes: earned.scheduledMinutes,
            payRule: earned.rule,
          }
        : {}),
    },
  };
}
