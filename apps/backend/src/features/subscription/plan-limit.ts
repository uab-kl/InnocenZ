import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import type { DbTransaction } from '@/types/db-transaction.js';
import {
  LIVE_MEMBER_SUBSCRIPTION_STATUSES,
  MemberSubscriptionTable,
  type MemberSubscription,
  type SubscriberType,
} from '@/features/member-subscription/member-subscription.model.js';
import type { CloseLaneFacts } from '@/features/member-subscription/plan-lane-rules.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { ShiftTable } from '@/features/shift/shift.model.js';
import { SubscriptionTable } from './subscription.model.js';

/**
 * What an org's plan allows, and what it has used — the one place either
 * question is answered.
 *
 * Until this existed the limits were text and habit: `subscription.coverage`
 * held the string '5 PV/week' and nothing could compare a count against it, so
 * the agency band was enforced NOWHERE and the outlet's PRs-per-day was enforced
 * only in the Post Job screen's own React state. Any caller that did not go
 * through that screen — the API directly, a script, a second UI — was unbounded.
 *
 * A LEAF module: it reads tables and imports no repository, so the shift
 * controller and the scheduler can both use it without closing an import cycle.
 */
export type PlanLimit = {
  /** The plan the org is on now, for the message a refusal carries. */
  planName: string;
  /** Max per period, or null when the plan is open-ended (Custom / Premier). */
  limitAmount: number | null;
};

/**
 * The three answers this lookup can give, as separate cases.
 *
 * It used to return `PlanLimit | null`, and `null` carried BOTH "this org holds
 * no plan" and "the query threw" — the catch below returned the same value as an
 * empty result. That was survivable only while the caller waved both through.
 * The moment a missing plan became a refusal (owner's call, 2 Sep 2026: no
 * outlet or agency may exist without a plan), collapsing them would have made a
 * transient database error take every venue offline at once.
 *
 * So the two are now impossible to confuse at the type level, and `unknown` is
 * the same idea as `outletDailyPrUsage`'s `-1`: a gate must never refuse on a
 * fact it does not have.
 */
export type PlanLookup =
  | ({ kind: 'plan' } & PlanLimit)
  /** The org holds no active plan row — never enrolled, or its plan has ended. */
  | { kind: 'none' }
  /** The read itself failed. NOT the same as `none`. */
  | { kind: 'unknown' };

/**
 * The org's live PLAN and its numeric allowance.
 *
 * Add-ons are excluded deliberately: POS integration is held alongside a plan
 * and is not a capacity product, so joining it here would let an add-on's NULL
 * limit read as the venue's allowance.
 *
 * `{ kind: 'none' }` means "no plan" and a `limitAmount: null` on a real plan
 * means "unlimited" — two different facts, and callers must not collapse them.
 * Nothing here decides what to do about either; that is the caller's rule.
 *
 * `client` is the pool unless the shift WRITE GUARD hands in its transaction
 * (1 Oct 2026): the venue's plan is then read again under the venue's lock, on
 * the connection that holds it — see `planCapacityRefusal`. ⚠️ As with
 * `outletDailyPrUsage`, a failed read inside a transaction also aborts it, so
 * `unknown` skips the gate but the write after it fails too: nothing is written.
 */
export async function resolveActivePlanLimit(
  params: {
    subscriberType: 'agency' | 'outlet';
    subscriberId: string;
  },
  client: DbTransaction | typeof db = db,
): Promise<PlanLookup> {
  try {
    const [row] = await client
      .select({
        planName: MemberSubscriptionTable.planName,
        limitAmount: SubscriptionTable.limitAmount,
      })
      .from(MemberSubscriptionTable)
      .leftJoin(SubscriptionTable, eq(MemberSubscriptionTable.subscriptionId, SubscriptionTable.id))
      .where(
        and(
          eq(MemberSubscriptionTable.subscriberType, params.subscriberType),
          eq(MemberSubscriptionTable.subscriberId, params.subscriberId),
          isNull(MemberSubscriptionTable.endedAt),
          // ⚠️ The STATUS as well as the date. Testing `ended_at IS NULL` alone
          // read the date and ignored the word beside it, so a row an admin set
          // to `cancelled` without stamping a date still counted as a plan here
          // while the billing side had already written it off. See the constant.
          inArray(MemberSubscriptionTable.status, [
            ...LIVE_MEMBER_SUBSCRIPTION_STATUSES,
          ]),
          // A row whose plan is missing from the catalog still counts as a plan;
          // only a row that IS an add-on is skipped.
          sql`coalesce(${SubscriptionTable.kind}::text, 'plan') = 'plan'`,
        ),
      )
      .limit(1);
    if (!row) return { kind: 'none' };
    return {
      kind: 'plan',
      planName: row.planName,
      // ⚠️ `limitAmount` comes off the LEFT-JOINED catalog row, so it is also
      // null when `subscription_id` resolves to nothing — a plan whose catalog
      // entry was deleted. That reads as "unlimited" here and the caller cannot
      // tell it apart from Premier. It is the narrower of the two remaining
      // permissive holes and is left as-is deliberately: inventing a cap for it
      // would refuse real Premier venues.
      limitAmount: row.limitAmount ?? null,
    };
  } catch (error) {
    logger.error('[plan-limit.resolveActivePlanLimit] Error:', error);
    return { kind: 'unknown' };
  }
}

export type PlanLaneSubscriber = { subscriberType: SubscriberType; subscriberId: string };

/**
 * Is there an outlet/agency row with this id — in the table its type names?
 *
 * `member_subscription.subscriber_id` (and `admin_request.subscriber_id`) carry
 * NO foreign key, because the id points into one of two tables. So nothing in
 * the schema stops a ledger row for an organisation that does not exist, and
 * one was opened on 28 Sep 2026: an ACTIVE Premier row for an outlet id found
 * in neither table. This is the question the schema cannot ask.
 *
 * THROWS on a failed read, deliberately. Every caller is about to write money
 * or refuse to, and "could not tell" must not be read as either answer.
 */
export async function subscriberOrgExists(
  subscriber: PlanLaneSubscriber,
  client: DbTransaction | typeof db = db,
): Promise<boolean> {
  if (subscriber.subscriberType === 'agency') {
    const [agency] = await client
      .select({ id: AgencyTable.id })
      .from(AgencyTable)
      .where(eq(AgencyTable.id, subscriber.subscriberId))
      .limit(1);
    return Boolean(agency);
  }
  const [outlet] = await client
    .select({ id: OutletTable.id })
    .from(OutletTable)
    .where(eq(OutletTable.id, subscriber.subscriberId))
    .limit(1);
  return Boolean(outlet);
}

/**
 * "This row is on the PLAN lane", asked WITHOUT a join: `FOR UPDATE` may not
 * reach the nullable side of an outer join, so the catalog is asked in a
 * subquery. A row with no `subscription_id` predates add-ons and counts as a
 * plan — the same rule `resolveActivePlanLimit` applies through its join.
 */
function onPlanLane(): SQL {
  return sql`(${MemberSubscriptionTable.subscriptionId} is null or exists (
    select 1 from "main"."subscription" s
     where s.id = ${MemberSubscriptionTable.subscriptionId} and s.kind = 'plan'))`;
}

/**
 * Hold this org's PLAN LANE until the caller's transaction ends.
 *
 * Row locks alone cannot keep the lane to one live row. Under READ COMMITTED a
 * second switch that queued behind the first one's `FOR UPDATE` wakes up with a
 * snapshot taken BEFORE the first one's new row existed — so it closes nothing
 * and opens a second live plan beside it. A transaction-scoped advisory lock,
 * taken before anything is read, makes the second writer wait first and read
 * after, so it sees the row the first one opened. The same device as
 * `payout_batch_reference`.
 *
 * Every writer of the lane takes it FIRST, before any row lock — a switch and
 * a cancel on one org then queue in the same order instead of deadlocking.
 * Re-entrant: taking it twice in one transaction is harmless.
 */
export async function takePlanLane(
  tx: DbTransaction,
  subscriber: PlanLaneSubscriber,
): Promise<void> {
  const key = `member_subscription:plan_lane:${subscriber.subscriberType}:${subscriber.subscriberId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

/**
 * Take the lane, then LOCK and return its live plan rows, newest first.
 *
 * "Live" is the shared definition — `ended_at` unset AND a live status — so a
 * row an admin set to `cancelled` without a date is not treated as a plan here
 * any more than it is by the posting gate or the invoice job.
 */
export async function lockLivePlanRows(
  tx: DbTransaction,
  subscriber: PlanLaneSubscriber,
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
        onPlanLane(),
      ),
    )
    .orderBy(desc(MemberSubscriptionTable.startedAt))
    .for('update');
}

/**
 * What the last-plan guard decides on, read INSIDE the caller's transaction
 * and under lock — `closeLaneVerdict` (plan-lane-rules.ts) makes the decision.
 *
 * The creation doors all refuse an org without a plan, but nothing guarded the
 * other end: `PATCH /member-subscription/:id/cancel` stamps `ended_at` and
 * writes no replacement, and `PUT /member-subscription/:id` lets an admin set
 * `ended_at` or a dead `status` by hand. Either one applied to an org's only
 * plan makes it planless in a single click — for an outlet an outage, because
 * the posting gate refuses a venue with no plan. ADD-ONS stay freely
 * cancellable: POS is held alongside a plan and dropping it takes nothing away.
 *
 * ⚠️ READ UNDER LOCK, IN THE SAME TRANSACTION AS THE WRITE. The first version
 * checked here and wrote in the controller afterwards, so two admins ending an
 * org's last two plan rows at once could each see the other's row still live
 * and both succeed. Now the lane is held from the check to the write.
 *
 * THROWS on a failed read, and the caller REFUSES — the opposite of the posting
 * gate's rule, deliberately: there, an unknown answer must not take a working
 * venue offline; here, it must not let an irreversible cancellation through on
 * a guess. A refused cancel during a database blip costs a retry.
 */
export async function readCloseLaneFacts(
  tx: DbTransaction,
  memberSubscriptionId: string,
): Promise<CloseLaneFacts> {
  const missing: CloseLaneFacts = { target: null, otherLivePlanRows: 0, subscriberExists: false };

  // WHICH lane first, unlocked, so the lane lock can be taken before any row
  // lock — the order `applyPlanChangeToLedger` takes them in.
  const [owner] = await tx
    .select({
      subscriberType: MemberSubscriptionTable.subscriberType,
      subscriberId: MemberSubscriptionTable.subscriberId,
    })
    .from(MemberSubscriptionTable)
    .where(eq(MemberSubscriptionTable.id, memberSubscriptionId))
    .limit(1);
  if (!owner) return missing;
  const subscriber = { subscriberType: owner.subscriberType, subscriberId: owner.subscriberId };
  await takePlanLane(tx, subscriber);

  const [target] = await tx
    .select({
      id: MemberSubscriptionTable.id,
      subscriptionId: MemberSubscriptionTable.subscriptionId,
      status: MemberSubscriptionTable.status,
      endedAt: MemberSubscriptionTable.endedAt,
    })
    .from(MemberSubscriptionTable)
    .where(eq(MemberSubscriptionTable.id, memberSubscriptionId))
    .limit(1)
    .for('update');
  if (!target) return missing;

  const [catalog] = target.subscriptionId
    ? await tx
        .select({ kind: SubscriptionTable.kind })
        .from(SubscriptionTable)
        .where(eq(SubscriptionTable.id, target.subscriptionId))
        .limit(1)
    : [];

  const live = await lockLivePlanRows(tx, subscriber);
  return {
    target: {
      kind: catalog?.kind ?? 'plan',
      status: target.status,
      endedAt: target.endedAt,
    },
    otherLivePlanRows: live.filter((row) => row.id !== target.id).length,
    subscriberExists: await subscriberOrgExists(subscriber, tx),
  };
}

/**
 * How many PRs this venue has already asked for on a calendar day: the sum of
 * `quantity` across its shifts that date, which is the headcount the venue
 * declared it needs.
 *
 * Counted from the SHIFT rows rather than from assignments on purpose — the plan
 * governs what a venue may REQUEST, and a shift posted for 8 PRs consumes 8 of
 * the day's allowance whether or not anyone has been rostered onto it yet.
 * `excludeShiftId` lets an edit measure the day without its own current value,
 * so raising a shift from 4 to 5 is checked as 5, not 9.
 *
 * `client` is the pool unless the shift WRITE GUARD hands in its transaction
 * (shift-write-guard.ts, 30 Sep 2026): the re-count under the venue's lock runs
 * on the connection that holds it, rather than a second pooled one that could
 * starve the pool while the lock is held. ⚠️ Inside a transaction a failed count
 * also aborts the transaction, so the -1 below skips the gate but the write
 * after it fails too: nothing is written.
 */
export async function outletDailyPrUsage(
  params: { outletId: string; shiftDate: string; excludeShiftId?: string },
  client: DbTransaction | typeof db = db,
): Promise<number> {
  try {
    // Built with the query builder, not a raw template. The first cut spliced
    // `${excludeShiftId ? sql`...` : sql``}` into `db.execute`, and the EMPTY
    // fragment made every call throw — which this function then swallowed into
    // its -1, so the gate silently let everything through. A capacity check that
    // fails open is worse than none, because the screen still claims a limit.
    // A DRAFT has not been asked for yet, so it consumes nothing. Everything
    // else on the day counts. There is deliberately no "cancelled" case: the
    // shift statuses are draft/open/confirmed/sealed and a withdrawn shift is
    // DELETED, so a row that exists is demand — an earlier cut filtered on a
    // status that does not exist, which would have compiled as a no-op idea and
    // read as a real exclusion.
    const conditions = [
      eq(ShiftTable.outletId, params.outletId),
      eq(ShiftTable.shiftDate, params.shiftDate),
      ne(ShiftTable.status, 'draft'),
    ];
    if (params.excludeShiftId) conditions.push(ne(ShiftTable.id, params.excludeShiftId));

    const [row] = await client
      .select({ used: sql<number>`coalesce(sum(${ShiftTable.quantity}), 0)::int` })
      .from(ShiftTable)
      .where(and(...conditions));
    return Number(row?.used ?? 0);
  } catch (error) {
    logger.error('[plan-limit.outletDailyPrUsage] Error:', error);
    // A count that FAILED must not read as "nothing used" and wave a write
    // through. The caller treats -1 as unknown and skips the gate rather than
    // refusing on a number it does not have.
    return -1;
  }
}

/**
 * How many payment vouchers an agency issued in a payroll week — the number the
 * tier bands are written against.
 *
 * Keyed on `week_start`, which is Sunday-anchored everywhere in this app, so the
 * caller must pass the same week string the vouchers carry.
 */
export async function agencyWeeklyPvCount(params: {
  agencyId: string;
  weekStart: string;
}): Promise<number> {
  try {
    const result = await db.execute(sql`
      select count(*)::int as issued
      from main.payment_voucher pv
      where pv.agency_id = ${params.agencyId}
        and pv.week_start = ${params.weekStart}
    `);
    const row = result.rows[0] as { issued: number } | undefined;
    return Number(row?.issued ?? 0);
  } catch (error) {
    logger.error('[plan-limit.agencyWeeklyPvCount] Error:', error);
    return -1;
  }
}
