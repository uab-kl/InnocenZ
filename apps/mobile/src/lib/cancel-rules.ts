/**
 * WHOSE cancellation rules — and so what cancelling a shift costs.
 *
 * Pure (no React) so the rule is tested. The fee is sealed by the SERVER from
 * the rules of the agency that booked the shift (`cancelMine` reads the
 * ASSIGNMENT's agency, and charges nothing when that agency has no
 * cancellation rule). The app showed one unnamed set of bands for every shift —
 * the defaults whenever the agency had written none — so a PR could read
 * "RM 125 from your next PV" for a cancellation the server then sealed at
 * RM 0.00, with no way to tell whose rules she was reading (28 Sep 2026 audit).
 *
 * ⚠️ `GET /pr/mine/penalty-rules` still answers for ONE membership, the oldest
 * (a backend item of its own). The rows carry `agencyId`, so they are grouped by
 * it here, and an agency with no rows reads as "no fee" — the server's own
 * answer for an agency without a rule. That is exact for every PR on file today
 * (29 Sep 2026, read-only: no PR has a rule-bearing agency other than her
 * oldest), and it becomes exact for everyone the day the endpoint returns every
 * membership's rows — this module needs no change for that.
 */
import type { PenaltyRuleRecord } from './api';
import {
  cancellationBandsFrom,
  DEFAULT_CANCELLATION_BANDS,
  type CancellationBands,
} from './demo-shifts';

type RuleRow = Pick<
  PenaltyRuleRecord,
  | 'agencyId'
  | 'ruleType'
  | 'enabled'
  | 'freeCancelHours'
  | 'shortNoticeHours'
  | 'shortNoticePct'
  | 'lateCancelPct'
>;

/** What the server charges an agency that has no cancellation rule: nothing. */
export const NO_CANCELLATION_FEE: CancellationBands = {
  ...DEFAULT_CANCELLATION_BANDS,
  enabled: false,
};

/**
 * The bands a shift booked by `agencyId` is charged by.
 *
 *  - rules not loaded (null): the defaults, as before — a slow or failed fetch
 *    must not blank the price;
 *  - no agency on the shift (an older backend): the one set the endpoint sent,
 *    as before;
 *  - otherwise that agency's own cancellation row, or no fee without one.
 */
export function cancellationBandsForAgency(
  rules: readonly RuleRow[] | null,
  agencyId: string | null | undefined,
): CancellationBands {
  if (!rules) return DEFAULT_CANCELLATION_BANDS;
  if (!agencyId) return cancellationBandsFrom([...rules]);
  const own = rules.filter((r) => r.agencyId === agencyId);
  if (!own.some((r) => r.ruleType === 'cancellation')) return NO_CANCELLATION_FEE;
  return cancellationBandsFrom(own);
}

export type CancellationRuleGroup = {
  agencyId: string | null;
  /** Null when no name is known — the group then renders unlabelled, as before. */
  agencyName: string | null;
  bands: CancellationBands;
};

/**
 * One set of rules PER AGENCY the PR works for, each under its name.
 *
 * `agencies` are her approved memberships (the session's list). Before they
 * load, the agencies the rows themselves name are shown, unlabelled; before
 * the rules load, the defaults, unlabelled — both what the panel always did.
 */
export function cancellationRuleGroups(
  rules: readonly RuleRow[] | null,
  agencies: readonly { agencyId: string; agencyName: string }[],
): CancellationRuleGroup[] {
  if (!rules) {
    return [{ agencyId: null, agencyName: null, bands: DEFAULT_CANCELLATION_BANDS }];
  }
  const seen = new Set<string>();
  const named = agencies.filter((a) => {
    if (seen.has(a.agencyId)) return false;
    seen.add(a.agencyId);
    return true;
  });
  if (named.length > 0) {
    return named.map((a) => ({
      agencyId: a.agencyId,
      agencyName: a.agencyName?.trim() || null,
      bands: cancellationBandsForAgency(rules, a.agencyId),
    }));
  }
  const ids = [...new Set(rules.map((r) => r.agencyId))];
  if (ids.length === 0) {
    return [{ agencyId: null, agencyName: null, bands: NO_CANCELLATION_FEE }];
  }
  return ids.map((id) => ({
    agencyId: id,
    agencyName: null,
    bands: cancellationBandsForAgency(rules, id),
  }));
}

/** The name of the agency that booked a shift — off the shift, else the membership list. */
export function shiftAgencyName(
  shift: { agencyId?: string | null; agencyName?: string | null },
  agencies: readonly { agencyId: string; agencyName: string }[],
): string | null {
  const own = shift.agencyName?.trim();
  if (own) return own;
  if (!shift.agencyId) return null;
  return agencies.find((a) => a.agencyId === shift.agencyId)?.agencyName?.trim() || null;
}
