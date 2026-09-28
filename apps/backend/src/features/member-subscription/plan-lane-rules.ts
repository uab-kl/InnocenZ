import { LIVE_MEMBER_SUBSCRIPTION_STATUSES } from './member-subscription.model.js';

/**
 * Pure rules about an org's PLAN LANE in `member_subscription` — the one lane
 * that must hold exactly one live row. Kept free of the database so every
 * branch is unit-tested; the locked reads that feed them live in plan-limit.ts.
 */

// ─── The last-plan guard ────────────────────────────────────────────────────

/** What the guard knows about the row being closed, read under lock. */
export type CloseLaneFacts = {
  /** The row being closed, or null when no such row exists. */
  target: { kind: 'plan' | 'addon'; status: string; endedAt: Date | null } | null;
  /** OTHER live plan rows of the same subscriber — the target excluded. */
  otherLivePlanRows: number;
  /** Is there an outlet/agency row with this subscriber id, in the table its type names? */
  subscriberExists: boolean;
};

export type CloseLaneVerdict =
  | 'not_found'
  | 'already_ended'
  /** An add-on, or a plan row already dead by status: closing it takes no plan away. */
  | 'not_a_live_plan'
  /** A live plan of an organisation that does not exist — nobody to leave planless. */
  | 'ghost'
  | 'another_plan_live'
  | 'last_plan';

/**
 * Would closing this row leave a REAL organisation with no plan?
 *
 * ⚠️ THE GHOST CASE is why this exists as more than a count. The guard used to
 * refuse whenever no other live plan row existed — including for a subscriber
 * that exists nowhere, so the one row an admin most needed to end (an ACTIVE
 * Premier row opened for a non-existent outlet, 28 Sep 2026) was the one it
 * would not let them touch. A row with no organisation behind it cannot strand
 * anybody, so it is let through, and the caller says so.
 */
export function closeLaneVerdict(facts: CloseLaneFacts): CloseLaneVerdict {
  const { target } = facts;
  if (!target) return 'not_found';
  if (target.endedAt !== null) return 'already_ended';
  const live: readonly string[] = LIVE_MEMBER_SUBSCRIPTION_STATUSES;
  if (target.kind !== 'plan' || !live.includes(target.status)) return 'not_a_live_plan';
  if (!facts.subscriberExists) return 'ghost';
  return facts.otherLivePlanRows > 0 ? 'another_plan_live' : 'last_plan';
}

/**
 * Which verdicts stop the write, per door.
 *
 * - `cancel` also refuses a row that already ENDED: cancelling it again would
 *   re-stamp `ended_at` and overwrite `expired` with `cancelled`, rewriting when
 *   (and how) the org actually left that plan.
 * - `edit` (PUT) lets that through — correcting an end date is what the edit
 *   door is for.
 */
export function closeLaneRefusal(
  verdict: CloseLaneVerdict,
  door: 'cancel' | 'edit',
): 'not_found' | 'already_ended' | 'last_plan' | null {
  if (verdict === 'not_found' || verdict === 'last_plan') return verdict;
  if (verdict === 'already_ended' && door === 'cancel') return verdict;
  return null;
}

// ─── Duplicate live plan rows ───────────────────────────────────────────────

export type LivePlanRow = {
  id: string;
  subscriberType: string;
  subscriberId: string;
  startedAt: Date;
  createdAt: Date;
};

export type SupersededLivePlanRow = {
  id: string;
  subscriberType: string;
  subscriberId: string;
  /** When the switch that should have closed it happened: its successor's start. */
  endedAt: Date;
  /** The row the subscriber keeps — its newest live plan. */
  keptId: string;
};

/**
 * Given every LIVE plan row, the ones to close so each subscriber keeps exactly
 * one: its newest (by `started_at`, then `created_at`, then id, so a re-run
 * always picks the same survivor).
 *
 * Each closed row ends when the NEXT row started — that is the moment the
 * switch happened, and the moment `applyPlanChangeToLedger` would have stamped
 * had its close step not been lost in the 3 Sep merge. Ending every row at the
 * newest one's start would tell History that an org held two plans at once.
 */
export function pickSupersededLivePlans(rows: readonly LivePlanRow[]): SupersededLivePlanRow[] {
  const lanes = new Map<string, LivePlanRow[]>();
  for (const row of rows) {
    const key = `${row.subscriberType}|${row.subscriberId}`;
    const lane = lanes.get(key);
    if (lane) lane.push(row);
    else lanes.set(key, [row]);
  }

  const superseded: SupersededLivePlanRow[] = [];
  for (const lane of lanes.values()) {
    if (lane.length < 2) continue;
    const ordered = [...lane].sort(
      (a, b) =>
        a.startedAt.getTime() - b.startedAt.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    const kept = ordered[ordered.length - 1];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const row = ordered[index];
      const successor = ordered[index + 1];
      superseded.push({
        id: row.id,
        subscriberType: row.subscriberType,
        subscriberId: row.subscriberId,
        endedAt: successor.startedAt,
        keptId: kept.id,
      });
    }
  }
  return superseded;
}
