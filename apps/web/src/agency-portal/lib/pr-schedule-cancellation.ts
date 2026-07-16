/** Cancellation & lateness rules for agency-managed PR shifts */

export const CANCEL_RULES = {
  /** ≥ this many hours before start — no pay deduction */
  safeNoticeHours: 24,
  /** < this many hours before start — penalty tier */
  penaltyNoticeHours: 2,
  /** Arriving more than this many minutes after shift start triggers wage deduction */
  lateArrivalMinutes: 15,
  shortNoticeDeductionPct: 25,
  penaltyDeductionPct: 50,
  defaultDailyWagesRm: 350,
} as const;

export type CancellationTier = 'safe' | 'short_notice' | 'penalty';

export interface CancellationEvaluation {
  tier: CancellationTier;
  hoursUntilStart: number;
  deductionRm: number;
  headline: string;
  detail: string;
}

export function shiftStartMs(dateIso: string, shiftStart: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = shiftStart.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
}

export function hoursUntilShiftStart(
  now: Date,
  dateIso: string,
  shiftStart: string,
): number {
  const diff = shiftStartMs(dateIso, shiftStart) - now.getTime();
  return diff / (60 * 60 * 1000);
}

export function evaluateShiftCancellation(
  now: Date,
  dateIso: string,
  shiftStart: string,
  dailyWagesRm: number = CANCEL_RULES.defaultDailyWagesRm,
): CancellationEvaluation {
  const hours = hoursUntilShiftStart(now, dateIso, shiftStart);

  if (hours >= CANCEL_RULES.safeNoticeHours) {
    return {
      tier: 'safe',
      hoursUntilStart: hours,
      deductionRm: 0,
      headline: 'On time notice — no pay deduction',
      detail: `${Math.floor(hours)}h+ before shift · Atlas will reassign coverage.`,
    };
  }

  if (hours >= CANCEL_RULES.penaltyNoticeHours) {
    const deductionRm = Math.round(
      (dailyWagesRm * CANCEL_RULES.shortNoticeDeductionPct) / 100,
    );
    return {
      tier: 'short_notice',
      hoursUntilStart: hours,
      deductionRm,
      headline: `Short notice — −RM ${deductionRm} from next PV`,
      detail: `Less than ${CANCEL_RULES.safeNoticeHours}h but more than ${CANCEL_RULES.penaltyNoticeHours}h before start.`,
    };
  }

  const deductionRm = Math.round(
    (dailyWagesRm * CANCEL_RULES.penaltyDeductionPct) / 100,
  );
  const lateLabel =
    hours <= 0
      ? 'Shift already started or passed'
      : `Less than ${CANCEL_RULES.penaltyNoticeHours}h before start`;
  return {
    tier: 'penalty',
    hoursUntilStart: hours,
    deductionRm,
    headline: `Late cancel — −RM ${deductionRm} from next PV`,
    detail: `${lateLabel} · same rule as arriving ${CANCEL_RULES.lateArrivalMinutes}+ min late.`,
  };
}

export function evaluateLateArrival(
  minutesLate: number,
  dailyWagesRm: number = CANCEL_RULES.defaultDailyWagesRm,
): { applies: boolean; deductionRm: number; headline: string } {
  if (minutesLate <= CANCEL_RULES.lateArrivalMinutes) {
    return {
      applies: false,
      deductionRm: 0,
      headline: `Within ${CANCEL_RULES.lateArrivalMinutes} min grace — no deduction`,
    };
  }
  const deductionRm = Math.round(
    (dailyWagesRm * CANCEL_RULES.penaltyDeductionPct) / 100,
  );
  return {
    applies: true,
    deductionRm,
    headline: `${minutesLate} min late — −RM ${deductionRm} wage deduction`,
  };
}

export const CANCELLATION_RULE_SUMMARY = [
  {
    label: '24h+ before shift',
    outcome: 'Cancel or mark unavailable — no deduction',
    tone: 'green' as const,
  },
  {
    label: '2h – 24h before',
    outcome: `−${CANCEL_RULES.shortNoticeDeductionPct}% daily wages on next PV`,
    tone: 'amber' as const,
  },
  {
    label: `<${CANCEL_RULES.penaltyNoticeHours}h before OR ${CANCEL_RULES.lateArrivalMinutes}+ min late`,
    outcome: `−${CANCEL_RULES.penaltyDeductionPct}% daily wages on next PV`,
    tone: 'red' as const,
  },
];
