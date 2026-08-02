import { MAX_PLAUSIBLE_SHIFT_HOURS } from '@/features/payment-voucher/payment-voucher-audit';

/**
 * Why the overtime claim came out the way it did.
 *
 * The caller needs this, not just the number: "no overrun" and "the stamp is not
 * believable" both yield no minutes, but only the second is worth a log line, and
 * neither should raise an approval request the agency cannot act on.
 */
export type OvertimeReason = 'no_schedule' | 'within_schedule' | 'implausible_stamp' | 'recorded';

export type OvertimeClaim = {
  /** Whole minutes worked past the scheduled end, or null when there is no claim. */
  minutes: number | null;
  reason: OvertimeReason;
  /** Hours from check-in to the real check-out — carried for the log line only. */
  elapsedHours: number | null;
};

/**
 * How much overtime a check-out may CLAIM, from the two stamps and the schedule.
 *
 * Pure, so the probe can walk a shift past midnight without waiting for one, and
 * so this rule is testable in a repo that has no test runner.
 *
 * ⚠️ An implausible stamp yields **null, not a capped figure**, deliberately.
 * This mirrors `pr-rate.ts` and `payment-voucher-audit.ts`, which both return 0
 * rather than clamping to MAX_PLAUSIBLE_SHIFT_HOURS, and the reason is this
 * feature's own history: the live `PV-000002` carried "Overtime 113.1h" on a
 * six-hour slot. A capped 16h would have been just as fictional and far harder to
 * notice, because it looks like a number somebody meant. A PR who forgets to
 * check out for two days has not worked two days of overtime — the stamp has
 * stopped being evidence, and the honest record of that is nothing at all.
 *
 * A forgotten check-out is not lost, only unclaimed: the shift still closes and
 * the clamp still seals the scheduled wages, so the agency can raise the hours by
 * hand if the PR really did work them.
 */
export function overtimeFromStamps(
  checkInAt: Date,
  scheduledEnd: Date | null,
  actualEnd: Date,
): OvertimeClaim {
  // No parseable slot means no scheduled end, which means no clamp either — the
  // stamp stands as given and there is no window to have run past.
  if (!scheduledEnd) return { minutes: null, reason: 'no_schedule', elapsedHours: null };

  const elapsedHours = (actualEnd.getTime() - checkInAt.getTime()) / 3_600_000;

  if (actualEnd <= scheduledEnd) return { minutes: null, reason: 'within_schedule', elapsedHours };

  if (elapsedHours <= 0 || elapsedHours > MAX_PLAUSIBLE_SHIFT_HOURS) {
    return { minutes: null, reason: 'implausible_stamp', elapsedHours };
  }

  const minutes = Math.round((actualEnd.getTime() - scheduledEnd.getTime()) / 60_000);
  // A check-out seconds past the scheduled end rounds to zero. Recording a
  // zero-minute claim would put a shift into `pending` for an agency to approve
  // nothing, so it is treated as no overrun at all.
  if (minutes <= 0) return { minutes: null, reason: 'within_schedule', elapsedHours };

  return { minutes, reason: 'recorded', elapsedHours };
}
