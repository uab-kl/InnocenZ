import type { AgencyPenaltyRule } from '@/features/agency/agency-penalty-rule.model.js';
import { toCents, formatCents } from '@/features/payment-voucher/payment-voucher-balance.js';

/**
 * Penalty evaluation — PROPOSES, never deducts.
 *
 * Nothing here writes to a voucher. A breach becomes money only when an agency
 * explicitly applies it, which is the same shape overtime already has: computed,
 * shown, and not money until a human signs off. That matters more than usual
 * here because a penalty takes pay AWAY from a worker, and most agencies have
 * written no rules at all. An auto-deduction on a half-configured rule set
 * would silently underpay people, and the Σ=0 check would cheerfully confirm
 * the wrong number.
 *
 * The rules are the AGENCY's since 0113. Reading them per-outlet double-counted
 * a PR who split her week between two venues of one agency: 2 shifts + 2 shifts
 * is 4, but each outlet saw only 2 and each fined her for missing a minimum of
 * 3. The window below is therefore whole-week and outlet-blind on purpose.
 *
 * The rules mirror apps/web/src/agency-portal/lib/pr-penalties.ts exactly,
 * including its boundary quirks — see each rule below. If the two ever disagree
 * the agency sees one number on screen and another on the voucher, which is
 * worse than either being wrong.
 */

/** What a PR actually did, aggregated from shift_assignment. */
export type PrAttendanceWindow = {
  /**
   * Shifts the AGENCY assigned this PR that week, whatever became of them.
   *
   * Opportunity, not attendance. It is the safety net on the minimum-shifts
   * rule: an agency that rosters someone twice cannot then fine them for not
   * working three times.
   */
  assignedThisWeek: number;
  /**
   * Assigned shifts the agency EXCUSED that week (approved MC/leave).
   *
   * Subtracted from the opportunity: approved leave is permission not to work,
   * so it cannot also be counted as a shift the PR failed to work. Weekly, and
   * deliberately separate from `mcThisMonth`, which is the monthly CAP rule —
   * the same absence can legitimately excuse the minimum here and still count
   * toward the cap there.
   */
  excusedThisWeek: number;
  /** Completed shifts inside the voucher week. */
  shiftsThisWeek: number;
  /** Check-ins later than shift start + the rule's grace, inside the week. */
  lateThisWeek: number;
  /** Approved MC/leave in the calendar month containing the week. */
  mcThisMonth: number;
};

export type PenaltyBreach = {
  ruleType: AgencyPenaltyRule['ruleType'];
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

/**
 * Evaluate one PR's window against their agency's rules.
 *
 * Every enabled rule binds every PR (0114) — there is no pay-class target, so
 * `enabled` is the whole test. That is stricter than what it replaced: rules
 * previously scoped to `commissionOnly` now bite basic PRs too.
 *
 * Never throws: a malformed `fine_rm` is reported as a zero-fine breach rather
 * than taking down a payout run. Money that cannot be read must not silently
 * become a number.
 */
export function evaluatePrPenalties(
  window: PrAttendanceWindow,
  rules: AgencyPenaltyRule[],
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
    if (!rule.enabled) continue;
    // `cancellation` shares this table but NOT this evaluation. It is charged
    // per shift, against that shift's daily wage, at the moment a PR cancels —
    // there is no weekly window to count it in. Skipped explicitly rather than
    // left to fall through the if-chain below, so adding a fourth weekly rule
    // later cannot accidentally start evaluating it.
    if (rule.ruleType === 'cancellation') continue;

    if (rule.ruleType === 'min_shifts_per_week') {
      const min = rule.minShiftsPerWeek;
      // SAFETY NET: you cannot work shifts you were never given, and you cannot
      // work the ones you were excused from.
      //
      // Opportunity = assigned MINUS approved MC/leave. Both subtractions are
      // the same principle — the PR must have had a real chance to reach the
      // minimum — but they fail differently if you skip either: without the
      // first, an agency that rosters someone twice fines them for not working
      // three times; without the second, an agency APPROVES a PR's medical
      // leave and then fines them for taking it.
      const opportunity = window.assignedThisWeek - window.excusedThisWeek;
      if (min != null && opportunity < min) continue;
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

/**
 * Rules that are only TRUE once the week has closed.
 *
 * "Worked fewer than 3 shifts" is not a fact on Tuesday — the PR has until
 * Saturday to work the other two. Lateness and the MC cap are different: a
 * third late arrival has already happened and no amount of remaining week
 * un-happens it, so those are final the moment they occur.
 *
 * Used by both the proposal list and the seal, so a rule cannot be shown as
 * live on one screen and recorded from a different window by the other.
 */
export const WEEK_END_ONLY_RULES: ReadonlySet<AgencyPenaltyRule['ruleType']> =
  new Set(['min_shifts_per_week']);

/** Grace period the late-rule uses, in minutes. No rule = no lateness concept. */
export function graceMinutesFor(rules: AgencyPenaltyRule[]): number | null {
  const late = rules.find((r) => r.ruleType === 'late_per_week' && r.enabled);
  return late?.graceMinutes ?? null;
}
