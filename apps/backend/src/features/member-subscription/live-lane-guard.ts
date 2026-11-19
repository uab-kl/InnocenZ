import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { db } from '@/db/index.js';
import type { DbTransaction } from '@/types/db-transaction.js';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';
import {
  lockLivePlanRows,
  subscriberOrgExists,
  takePlanLane,
  type PlanLaneSubscriber,
} from '@/features/subscription/plan-limit.js';
import {
  LIVE_MEMBER_SUBSCRIPTION_STATUSES,
  MemberSubscriptionTable,
  type MemberSubscription,
} from './member-subscription.model.js';

/**
 * THE OTHER END OF THE LANE RULE: opening a live row, not closing one.
 *
 * An org's PLAN lane must hold exactly one live row, and each add-on product at
 * most one. Sign-up enrolment and the plan switch (`applyPlanChangeToLedger`)
 * keep that rule under the lane lock; the last-plan guard (`readCloseLaneFacts`)
 * keeps the closing side. Three doors opened a live row with NO lock and NO
 * check, and are what this module closes:
 *
 *   - `POST /member-subscription` (admin create) — a second live plan, or a row
 *     for an organisation that does not exist;
 *   - `PUT /member-subscription/:id` setting `endedAt: null` or a live status —
 *     reopening an ended row beside the plan that replaced it;
 *   - the POS add-on re-quote (admin-request-ledger.ts), which expired and
 *     created across separate round trips and skipped `past_due` add-ons.
 *
 * Two live plans do not double the invoice (the generator charges once per org
 * per lane per period), but they make the POSTING LIMIT unpredictable: it reads
 * one live plan row while billing reads the newest. Nothing in the database
 * stops it — `subscriber_id` is polymorphic and the plan/add-on split lives on
 * the catalog — so this code is the guarantee.
 */

export type LaneKind = 'plan' | 'addon';

type Client = DbTransaction | typeof db;

/**
 * Which lane a catalog product sits on. No product at all is the PLAN lane —
 * the same legacy rule `resolveActivePlanLimit` and `onPlanLane` apply — and an
 * id the catalog does not hold is `missing`, so it can be refused with a
 * sentence instead of dying on the foreign key.
 */
export async function catalogLaneKind(
  client: Client,
  subscriptionId: string | null,
): Promise<LaneKind | 'missing'> {
  if (!subscriptionId) return 'plan';
  const [row] = await client
    .select({ kind: SubscriptionTable.kind })
    .from(SubscriptionTable)
    .where(eq(SubscriptionTable.id, subscriptionId))
    .limit(1);
  if (!row) return 'missing';
  return row.kind === 'addon' ? 'addon' : 'plan';
}

/**
 * Take the lane, then LOCK and return the org's live ADD-ON rows, newest first —
 * of one product when `subscriptionId` is given, of every add-on otherwise.
 *
 * The add-on twin of `lockLivePlanRows`, under the SAME advisory lock, so a plan
 * switch, a cancel and an add-on write on one org all queue in one order. "Live"
 * is the shared definition (`ended_at` unset AND active/past_due): reading
 * `status = 'active'` alone is how a `past_due` add-on survived a re-quote and
 * sat live beside its replacement.
 */
export async function lockLiveAddonRows(
  tx: DbTransaction,
  subscriber: PlanLaneSubscriber,
  subscriptionId?: string,
): Promise<MemberSubscription[]> {
  await takePlanLane(tx, subscriber);
  return tx
    .select()
    .from(MemberSubscriptionTable)
    .where(
      and(
        eq(MemberSubscriptionTable.subscriberType, subscriber.subscriberType),
        eq(MemberSubscriptionTable.subscriberId, subscriber.subscriberId),
        isNull(MemberSubscriptionTable.endedAt),
        inArray(MemberSubscriptionTable.status, [...LIVE_MEMBER_SUBSCRIPTION_STATUSES]),
        // No outer join: `FOR UPDATE` may not reach its nullable side.
        subscriptionId
          ? eq(MemberSubscriptionTable.subscriptionId, subscriptionId)
          : sql`exists (
              select 1 from "main"."subscription" s
               where s.id = ${MemberSubscriptionTable.subscriptionId} and s.kind = 'addon')`,
      ),
    )
    .orderBy(desc(MemberSubscriptionTable.startedAt))
    .for('update');
}

/** The live rows a new or reopened row would sit beside, on its own lane. */
export function lockLiveLaneRows(
  tx: DbTransaction,
  subscriber: PlanLaneSubscriber,
  lane: LaneKind,
  subscriptionId: string | null,
): Promise<MemberSubscription[]> {
  return lane === 'plan'
    ? lockLivePlanRows(tx, subscriber)
    : lockLiveAddonRows(tx, subscriber, subscriptionId ?? undefined);
}

export type OpenLaneFacts = {
  lane: LaneKind | 'missing';
  subscriberType: PlanLaneSubscriber['subscriberType'];
  subscriberExists: boolean;
  /** Live rows already on the same lane — the row being written excluded. */
  otherLiveRows: ReadonlyArray<{ planName: string }>;
};

export type OpenLaneRefusal = { status: 400 | 409; message: string };

/**
 * Would writing this row break the lane rule? A sentence for each refusal, so
 * the admin is told what to do instead (the confirm-every-action rule).
 *
 * `opensLive` is false for a row written already dead (a back-dated history
 * entry): it cannot sit live beside anything, so only the org check applies.
 */
export function openLaneRefusal(facts: OpenLaneFacts, opensLive: boolean): OpenLaneRefusal | null {
  if (facts.lane === 'missing') {
    return {
      status: 400,
      message: 'That plan or add-on is not in the catalog. Nothing was saved — choose one that exists.',
    };
  }
  if (!facts.subscriberExists) {
    return {
      status: 400,
      message: `No ${facts.subscriberType} with this id is registered, so no subscription can be opened for it. Nothing was saved.`,
    };
  }
  if (!opensLive || facts.otherLiveRows.length === 0) return null;
  const held = facts.otherLiveRows[0].planName;
  return facts.lane === 'plan'
    ? {
        status: 409,
        message:
          `This ${facts.subscriberType} is already on ${held}. Nothing was saved — move it with a plan change ` +
          'instead of opening a second live plan, or its posting limit and its bill would disagree.',
      }
    : {
        status: 409,
        message:
          `This ${facts.subscriberType} already holds a live ${held} add-on. Nothing was saved — ` +
          're-quote that line instead of opening a second one for the same product.',
      };
}

/**
 * Everything `openLaneRefusal` decides on for a REOPEN, read inside the
 * caller's transaction and under the lane lock — the mirror of
 * `readCloseLaneFacts`, taking its locks in the same order (lane, then the row,
 * then the lane's live rows).
 */
export async function readReopenFacts(
  tx: DbTransaction,
  memberSubscriptionId: string,
): Promise<{ target: MemberSubscription; facts: OpenLaneFacts } | null> {
  const [owner] = await tx
    .select({
      subscriberType: MemberSubscriptionTable.subscriberType,
      subscriberId: MemberSubscriptionTable.subscriberId,
    })
    .from(MemberSubscriptionTable)
    .where(eq(MemberSubscriptionTable.id, memberSubscriptionId))
    .limit(1);
  if (!owner) return null;
  const subscriber = { subscriberType: owner.subscriberType, subscriberId: owner.subscriberId };
  await takePlanLane(tx, subscriber);

  const [target] = await tx
    .select()
    .from(MemberSubscriptionTable)
    .where(eq(MemberSubscriptionTable.id, memberSubscriptionId))
    .limit(1)
    .for('update');
  if (!target) return null;

  const lane = await catalogLaneKind(tx, target.subscriptionId);
  const live =
    lane === 'missing' ? [] : await lockLiveLaneRows(tx, subscriber, lane, target.subscriptionId);
  return {
    target,
    facts: {
      lane,
      subscriberType: subscriber.subscriberType,
      subscriberExists: await subscriberOrgExists(subscriber, tx),
      otherLiveRows: live.filter((row) => row.id !== target.id),
    },
  };
}
