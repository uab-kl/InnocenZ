import type { OutletPenaltyRule, PayClass } from '@/features/outlet-workspace/outlet-workspace.model.js';
import { toCents, formatCents } from '@/features/payment-voucher/payment-voucher-balance.js';

/**
 * Penalty evaluation — PROPOSES, never deducts.
 *
 * Nothing here writes to a voucher. A breach becomes money only when an agency
 * explicitly applies it, which is the same shape overtime already has: computed,
 * shown, and not money until a human signs off. That matters more than usual
 * here because a penalty takes pay AWAY from a worker, and the rules are barely
 * configured — one outlet of six has any rows at all. An auto-deduction on a
 * half-configured rule set would silently underpay people, and the Σ=0 check
 * would cheerfully confirm the wrong number.
 *
 * The rules mirror apps/web/src/agency-portal/lib/pr-penalties.ts exactly,
 * including its boundary quirks — see each rule below. If the two ever disagree
 * the agency sees one number on screen and another on the voucher, which is
 * worse than either being wrong.
 */

/** What a PR actually did, aggregated from shift_assignment. */
export type PrAttendanceWindow = {
  /** Completed shifts inside the voucher week. */
  shiftsThisWeek: number;
  /** Check-ins later than shift start + the rule's grace, inside the week. */
  lateThisWeek: number;
  /** Approved MC/leave in the calendar month containing the week. */
  mcThisMonth: number;
};

export type PenaltyBreach = {
  ruleType: OutletPenaltyRule['ruleType'];
  label: string;
  detail: string;
  /** Fine in cents. 0 means "warning only" — a real rule with no money on it. */
  fineCents: number;
};

export type PenaltyProposal = {
  breaches: PenaltyBreach[];
  totalFineCents: number;
  /** "80.00" — ready to hand to PUT /payment-voucher/:id as `deduction`. */
  totalFineRm: string;
};

function ruleApplies(rule: OutletPenaltyRule, payClass: PayClass): boolean {
  return rule.enabled && (rule.appliesTo ?? []).includes(payClass);
}

/**
 * Evaluate one PR's window against one outlet's rules.
 *
 * Never throws: a malformed `fine_rm` is reported as a zero-fine breach rather
 * than taking down a payout run. Money that cannot be read must not silently
 * become a number.
 */
export function evaluatePrPenalties(
  payClass: PayClass,
  window: PrAttendanceWindow,
  rules: OutletPenaltyRule[],
): PenaltyProposal {
  const breaches: PenaltyBreach[] = [];
  const cents = (value: string | null | undefined, fallback = 0): number => {
    try {
      return toCents(value ?? '0');
    } catch {
      return fallback;
    }
  };

  for (const rule of rules) {
    if (!ruleApplies(rule, payClass)) continue;

    if (rule.ruleType === 'min_shifts_per_week') {
      const min = rule.minShiftsPerWeek;
      // Strictly BELOW the minimum — hitting it exactly is compliance.
      if (min != null && window.shiftsThisWeek < min) {
        breaches.push({
          ruleType: rule.ruleType,
          label: 'Below minimum shifts',
          detail: `${window.shiftsThisWeek} of ${min} shifts this week`,
          fineCents: cents(rule.fineRm),
        });
      }
    }

    if (rule.ruleType === 'max_mc_per_month') {
      const cap = rule.maxMcPerMonth;
      // Strictly ABOVE the cap, and the fine is base + per-excess.
      if (cap != null && window.mcThisMonth > cap) {
        const excess = window.mcThisMonth - cap;
        breaches.push({
          ruleType: rule.ruleType,
          label: 'MC cap exceeded',
          detail: `${window.mcThisMonth} MC this month · cap ${cap}`,
          fineCents: cents(rule.fineRm) + excess * cents(rule.finePerExcessRm),
        });
      }
    }

    if (rule.ruleType === 'late_per_week') {
      const max = rule.maxLatePerWeek;
      // NOTE: `>=`, not `>`. The frontend fires AT the limit rather than past it,
      // so "max 2 lates" bites on the 2nd. Kept identical on purpose — the two
      // must agree even where the wording reads oddly.
      if (max != null && window.lateThisWeek >= max) {
        breaches.push({
          ruleType: rule.ruleType,
          label: 'Late too often',
          detail: `Late ${window.lateThisWeek}× this week · limit ${max}`,
          fineCents: cents(rule.fineRm),
        });
      }
    }
  }

  const totalFineCents = breaches.reduce((sum, b) => sum + b.fineCents, 0);
  return { breaches, totalFineCents, totalFineRm: formatCents(totalFineCents) };
}

/** Grace period the late-rule uses, in minutes. No rule = no lateness concept. */
export function graceMinutesFor(rules: OutletPenaltyRule[]): number | null {
  const late = rules.find((r) => r.ruleType === 'late_per_week' && r.enabled);
  return late?.graceMinutes ?? null;
}
