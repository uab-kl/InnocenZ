/**
 * The tier MIX a shift asked for, and whether one more PR of a given tier fits.
 *
 * A LEAF module on purpose: it imports nothing from the repository or the
 * controllers, so the repository can enforce the rule and `resolve-tier-wages`
 * can share the label map without the two forming an import cycle (a latent one
 * of those took the whole agency portal down once).
 *
 * The rules, as decided 11 Aug 2026:
 *  - `shift.quantity` governs. `sum(pr_count)` may never exceed it; the per-tier
 *    rows PARTITION the headcount, they do not add to it.
 *  - A tier at its `pr_count` is a HARD cap — the agency is blocked, not warned.
 *  - No tier rows, or rows summing to 0, means no per-tier cap at all: only
 *    `quantity` binds. That is what keeps the 9 pre-composer shifts assignable
 *    without a migration.
 *  - `commission_only` is its own bucket, keyed on `kind` — never on a label.
 */

/**
 * The `pr.tier` enum mapped to the outlet workspace's tier-rate LABELS. Ranked
 * tiers carry a label (`kind='tier'`); commission-only deliberately has none —
 * it is identified by `kind`, and giving it a fake label here would break the
 * rate resolver, which matches commission-only on the flag rather than the text.
 *
 * Lives here rather than in `resolve-tier-wages` so the wage resolver and the
 * demand counter read ONE definition. Keep in step with `prTierValues` and the
 * outlet portal's `OUTLET_PR_TIERS`.
 */
export const PR_TIER_TO_OUTLET_LABEL: Record<string, string> = {
  tier_1: 'Tier I',
  tier_2: 'Tier II',
  tier_3: 'Tier III',
  tier_4: 'Tier IV',
  tier_5: 'Tier V',
  servant: 'Servant',
};

/** The bucket commission-only demand and commission-only PRs both land in. */
export const COMMISSION_ONLY_BUCKET = 'commission_only';

/**
 * Which demand bucket a PR counts against.
 *
 * `null` means "unnamed": a tier the shift did not ask for by name. Those PRs
 * compete for the LEFTOVER seats (`quantity - sum(pr_count)`) rather than for a
 * named tier's quota — see `seatFor`.
 */
export function bucketForPrTier(tier: string | null | undefined): string | null {
  if (!tier) return null;
  if (tier === COMMISSION_ONLY_BUCKET) return COMMISSION_ONLY_BUCKET;
  return PR_TIER_TO_OUTLET_LABEL[tier] ?? null;
}

/** Which bucket one `shift_pay_tier` row declares demand for. */
export function bucketForDemandRow(row: { kind: string; tier: string | null }): string | null {
  if (row.kind === COMMISSION_ONLY_BUCKET) return COMMISSION_ONLY_BUCKET;
  return row.tier ?? null;
}

export interface DemandRow {
  kind: string;
  tier: string | null;
  prCount: number;
}

export type SeatVerdict =
  | { ok: true }
  | { ok: false; reason: 'tier_full'; bucket: string; asked: number; staffed: number }
  | { ok: false; reason: 'no_unnamed_seat'; leftover: number; staffed: number };

/** Requested headcount per bucket, and the total across them. */
function askedByBucket(demand: DemandRow[]): { asked: Map<string, number>; totalAsked: number } {
  const asked = new Map<string, number>();
  let totalAsked = 0;
  for (const row of demand) {
    const bucket = bucketForDemandRow(row);
    if (!bucket) continue;
    asked.set(bucket, (asked.get(bucket) ?? 0) + row.prCount);
    totalAsked += row.prCount;
  }
  return { asked, totalAsked };
}

/**
 * Does one more PR of `incomingBucket` fit, given what the shift asked for and
 * who is already on it?
 *
 * Pure — no DB, no clock — so the rule can be reasoned about and tested on its
 * own. The caller supplies the buckets of the PRs currently STAFFING the shift
 * (non-staffing statuses already filtered out) and must have checked total
 * `quantity` separately; this answers only the mix question.
 */
export function seatFor(params: {
  demand: DemandRow[];
  quantity: number;
  staffedBuckets: (string | null)[];
  incomingBucket: string | null;
}): SeatVerdict {
  const { demand, quantity, staffedBuckets, incomingBucket } = params;
  const { asked, totalAsked } = askedByBucket(demand);

  // No mix was ever specified — every seat is unnamed, so only `quantity` binds.
  // This is the pre-composer shift, and it must stay assignable.
  if (totalAsked === 0) return { ok: true };

  // A tier the shift named: its own quota, and nothing else.
  if (incomingBucket && asked.has(incomingBucket)) {
    const want = asked.get(incomingBucket) ?? 0;
    const have = staffedBuckets.filter((b) => b === incomingBucket).length;
    return have >= want
      ? { ok: false, reason: 'tier_full', bucket: incomingBucket, asked: want, staffed: have }
      : { ok: true };
  }

  // A tier the shift did NOT name competes for whatever headcount was left
  // unallocated. Deliberately NOT shared with the named tiers: letting a named
  // tier spill into the leftover would put a 5th Tier I on a shift that asked
  // for 4, which is the exact thing the hard cap exists to refuse.
  const leftover = Math.max(0, quantity - totalAsked);
  const have = staffedBuckets.filter((b) => !b || !asked.has(b)).length;
  return have >= leftover
    ? { ok: false, reason: 'no_unnamed_seat', leftover, staffed: have }
    : { ok: true };
}

/**
 * Remaining seats per bucket, plus the unnamed leftover — for the UIs that must
 * OFFER only what the API will accept. `capped: false` means the shift declared
 * no mix, so any tier fits and only `quantity` limits it.
 */
export function remainingByBucket(params: {
  demand: DemandRow[];
  quantity: number;
  staffedBuckets: (string | null)[];
}): { byBucket: Map<string, number>; unnamed: number; capped: boolean } {
  const { demand, quantity, staffedBuckets } = params;
  const { asked, totalAsked } = askedByBucket(demand);
  if (totalAsked === 0) {
    return { byBucket: new Map(), unnamed: Math.max(0, quantity), capped: false };
  }
  const byBucket = new Map<string, number>();
  for (const [bucket, want] of asked) {
    const have = staffedBuckets.filter((b) => b === bucket).length;
    byBucket.set(bucket, Math.max(0, want - have));
  }
  const unnamedStaffed = staffedBuckets.filter((b) => !b || !asked.has(b)).length;
  return {
    byBucket,
    unnamed: Math.max(0, quantity - totalAsked - unnamedStaffed),
    capped: true,
  };
}

/** Sum of a shift's requested per-tier headcount. */
export function totalDemand(demand: DemandRow[]): number {
  return askedByBucket(demand).totalAsked;
}
