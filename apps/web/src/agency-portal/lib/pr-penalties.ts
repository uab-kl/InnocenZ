/** PR pay class + outlet penalty-rule configuration (Phase 1: config surface only). */

/** Employment arrangement — a commissionOnly PR earns no basic wage (RM 0 daily). */
export type PrPayClass = 'basic' | 'commissionOnly';

export const PR_PAY_CLASSES: readonly PrPayClass[] = [
  'basic',
  'commissionOnly',
] as const;

export const PR_PAY_CLASS_LABELS: Record<PrPayClass, string> = {
  basic: 'Basic',
  commissionOnly: 'Commission only',
};

/** One entry in a PR's pay-class audit trail — the class takes effect from `fromIso`. */
export interface PrPayClassChange {
  payClass: PrPayClass;
  /** Effective date, ISO yyyy-mm-dd. */
  fromIso: string;
}

/** Resolve a PR's pay class — defaults to basic so legacy profiles stay valid. */
export function prPayClass(pr: { payClass?: PrPayClass }): PrPayClass {
  return pr.payClass ?? 'basic';
}

/**
 * The pay class in force on a given date: the latest history entry whose
 * `fromIso` is on or before `dateIso`. Falls back to the current `payClass`
 * (then basic) when there's no applicable history — so legacy/un-migrated PRs
 * and dates before the first recorded change resolve safely.
 */
export function prPayClassOnDate(
  pr: { payClass?: PrPayClass; payClassHistory?: PrPayClassChange[] },
  dateIso: string,
): PrPayClass {
  const applicable = (pr.payClassHistory ?? [])
    .filter((c) => c.fromIso <= dateIso)
    .sort((a, b) =>
      a.fromIso < b.fromIso ? -1 : a.fromIso > b.fromIso ? 1 : 0,
    );
  const latest = applicable[applicable.length - 1];
  return latest?.payClass ?? prPayClass(pr);
}

/**
 * Record a pay-class change on a PR's history, effective from `fromIso`, and
 * set it as the current class. Immutable — returns the fields to merge. Collapses
 * a same-date entry so re-editing a future-dated change doesn't duplicate it.
 */
export function applyPayClassChange(
  pr: { payClass?: PrPayClass; payClassHistory?: PrPayClassChange[] },
  next: PrPayClass,
  fromIso: string,
): { payClass: PrPayClass; payClassHistory: PrPayClassChange[] } {
  const history = (pr.payClassHistory ?? []).filter(
    (c) => c.fromIso !== fromIso,
  );
  return {
    payClass: next,
    payClassHistory: [...history, { payClass: next, fromIso }].sort((a, b) =>
      a.fromIso < b.fromIso ? -1 : a.fromIso > b.fromIso ? 1 : 0,
    ),
  };
}

/** Shared shape for every penalty rule. */
export interface PenaltyRuleBase {
  enabled: boolean;
  /** Which pay classes this rule enforces. */
  appliesTo: PrPayClass[];
  /** RM fine per breach — 0 = warning only, no money. */
  fineRm: number;
}

export interface MinShiftsPerWeekRule extends PenaltyRuleBase {
  /** PR must work at least this many shifts each week. */
  minShiftsPerWeek: number;
}

export interface MaxMcPerMonthRule extends PenaltyRuleBase {
  /** Allowed medical certificates per calendar month before a fine applies. */
  maxMcPerMonth: number;
  /** Fine charged per MC over the cap (multiplied by the overage). */
  finePerExcessRm: number;
}

export interface LatePerWeekRule extends PenaltyRuleBase {
  /** Being late this many times within a week triggers the fine. */
  maxLatePerWeek: number;
  /** Minutes after shift start before a check-in counts as late. */
  graceMinutes: number;
}

export interface OutletPenaltyRules {
  minShiftsPerWeek: MinShiftsPerWeekRule;
  maxMcPerMonth: MaxMcPerMonthRule;
  latePerWeek: LatePerWeekRule;
}

export const DEFAULT_PENALTY_RULES: OutletPenaltyRules = {
  minShiftsPerWeek: {
    enabled: true,
    appliesTo: ['commissionOnly'],
    fineRm: 50,
    minShiftsPerWeek: 3,
  },
  maxMcPerMonth: {
    enabled: true,
    appliesTo: ['commissionOnly', 'basic'],
    fineRm: 0,
    maxMcPerMonth: 2,
    finePerExcessRm: 80,
  },
  latePerWeek: {
    enabled: true,
    appliesTo: ['commissionOnly'],
    fineRm: 30,
    maxLatePerWeek: 2,
    graceMinutes: 15,
  },
};

function normalizeAppliesTo(
  value: unknown,
  fallback: PrPayClass[],
): PrPayClass[] {
  if (!Array.isArray(value)) return [...fallback];
  const filtered = value.filter(
    (v): v is PrPayClass => v === 'basic' || v === 'commissionOnly',
  );
  return filtered.length > 0 ? Array.from(new Set(filtered)) : [...fallback];
}

/** Merge persisted/partial penalty rules over defaults — back-compat safe. */
export function normalizePenaltyRules(
  rules: Partial<OutletPenaltyRules> | undefined,
): OutletPenaltyRules {
  const d = DEFAULT_PENALTY_RULES;
  return {
    minShiftsPerWeek: {
      ...d.minShiftsPerWeek,
      ...rules?.minShiftsPerWeek,
      appliesTo: normalizeAppliesTo(
        rules?.minShiftsPerWeek?.appliesTo,
        d.minShiftsPerWeek.appliesTo,
      ),
    },
    maxMcPerMonth: {
      ...d.maxMcPerMonth,
      ...rules?.maxMcPerMonth,
      appliesTo: normalizeAppliesTo(
        rules?.maxMcPerMonth?.appliesTo,
        d.maxMcPerMonth.appliesTo,
      ),
    },
    latePerWeek: {
      ...d.latePerWeek,
      ...rules?.latePerWeek,
      appliesTo: normalizeAppliesTo(
        rules?.latePerWeek?.appliesTo,
        d.latePerWeek.appliesTo,
      ),
    },
  };
}

/** Per-PR attendance signals. undefined = unknown (not treated as a breach). */
export interface PrAttendanceWindow {
  shiftsThisWeek?: number;
  lateThisWeek?: number;
  mcThisMonth?: number;
}

export type PenaltyRuleId = keyof OutletPenaltyRules;

export interface PenaltyBreach {
  ruleId: PenaltyRuleId;
  label: string;
  detail: string;
  /** Computed fine in RM — 0 means warning only. */
  fineRm: number;
}

/** Read a PR's demo counters into an evaluation window. */
export function prAttendanceWindow(pr: {
  shiftsThisWeek?: number;
  lateThisWeek?: number;
  mcThisMonth?: number;
}): PrAttendanceWindow {
  return {
    shiftsThisWeek: pr.shiftsThisWeek,
    lateThisWeek: pr.lateThisWeek,
    mcThisMonth: pr.mcThisMonth,
  };
}

/** Evaluate a PR's attendance window against the outlet's penalty rules. */
export function evaluatePrPenalties(
  payClass: PrPayClass,
  window: PrAttendanceWindow,
  rules: OutletPenaltyRules,
): PenaltyBreach[] {
  const breaches: PenaltyBreach[] = [];

  const min = rules.minShiftsPerWeek;
  if (
    min.enabled &&
    min.appliesTo.includes(payClass) &&
    window.shiftsThisWeek != null &&
    window.shiftsThisWeek < min.minShiftsPerWeek
  ) {
    breaches.push({
      ruleId: 'minShiftsPerWeek',
      label: 'Below minimum shifts',
      detail: `${window.shiftsThisWeek} of ${min.minShiftsPerWeek} shifts this week`,
      fineRm: min.fineRm,
    });
  }

  const mc = rules.maxMcPerMonth;
  if (
    mc.enabled &&
    mc.appliesTo.includes(payClass) &&
    window.mcThisMonth != null &&
    window.mcThisMonth > mc.maxMcPerMonth
  ) {
    const excess = window.mcThisMonth - mc.maxMcPerMonth;
    breaches.push({
      ruleId: 'maxMcPerMonth',
      label: 'MC cap exceeded',
      detail: `${window.mcThisMonth} MC this month · cap ${mc.maxMcPerMonth}`,
      fineRm: mc.fineRm + excess * mc.finePerExcessRm,
    });
  }

  const late = rules.latePerWeek;
  if (
    late.enabled &&
    late.appliesTo.includes(payClass) &&
    window.lateThisWeek != null &&
    window.lateThisWeek >= late.maxLatePerWeek
  ) {
    breaches.push({
      ruleId: 'latePerWeek',
      label: 'Late too often',
      detail: `Late ${window.lateThisWeek}× this week · limit ${late.maxLatePerWeek}`,
      fineRm: late.fineRm,
    });
  }

  return breaches;
}

/** Sum of every breach fine (RM). */
export function totalPenaltyFineRm(breaches: PenaltyBreach[]): number {
  return breaches.reduce((sum, b) => sum + b.fineRm, 0);
}

/** Total RM to deduct from a PR's next payout for their current penalty breaches. */
export function penaltyDeductRmForPr(
  pr: {
    payClass?: PrPayClass;
    shiftsThisWeek?: number;
    lateThisWeek?: number;
    mcThisMonth?: number;
  },
  rules: OutletPenaltyRules,
): number {
  return totalPenaltyFineRm(
    evaluatePrPenalties(prPayClass(pr), prAttendanceWindow(pr), rules),
  );
}
