import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  LIVE_MEMBER_SUBSCRIPTION_STATUSES,
  MemberSubscriptionTable,
} from '@/features/member-subscription/member-subscription.model.js';
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
 */
export async function resolveActivePlanLimit(params: {
  subscriberType: 'agency' | 'outlet';
  subscriberId: string;
}): Promise<PlanLookup> {
  try {
    const [row] = await db
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

/**
 * Would closing this ledger row leave its org with no plan at all?
 *
 * The creation doors all refuse an org without a plan now, but nothing guarded
 * the other end: `PATCH /member-subscription/:id/cancel` stamps `ended_at` and
 * writes no replacement, and `PUT /member-subscription/:id` lets an admin set
 * `ended_at` or a dead `status` by hand. Either one applied to an org's only
 * plan makes it planless in a single click — and for an outlet that is now an
 * outage, because the posting gate refuses a venue with no plan.
 *
 * ADD-ONS ARE FREELY CANCELLABLE. Only a `kind = 'plan'` lane is a plan; POS
 * integration is held alongside one and dropping it takes nothing away.
 *
 * Returns `'unknown'` when it cannot tell. The caller REFUSES on unknown, which
 * is the opposite of the posting gate's rule and deliberately so: there, an
 * unknown answer must not take a working venue offline; here, an unknown answer
 * must not let an irreversible cancellation through on a guess. Refusing an
 * admin's cancel during a database blip costs a retry.
 */
export async function wouldLeaveOrgPlanless(
  memberSubscriptionId: string,
): Promise<'no' | 'yes' | 'unknown'> {
  try {
    const [row] = await db
      .select({
        subscriberType: MemberSubscriptionTable.subscriberType,
        subscriberId: MemberSubscriptionTable.subscriberId,
        status: MemberSubscriptionTable.status,
        endedAt: MemberSubscriptionTable.endedAt,
        kind: sql<string>`coalesce(${SubscriptionTable.kind}::text, 'plan')`,
      })
      .from(MemberSubscriptionTable)
      .leftJoin(
        SubscriptionTable,
        eq(MemberSubscriptionTable.subscriptionId, SubscriptionTable.id),
      )
      .where(eq(MemberSubscriptionTable.id, memberSubscriptionId))
      .limit(1);

    // No such row, an add-on, or a lane the org has ALREADY left: closing it
    // takes no plan away, so there is nothing to protect.
    if (!row) return 'no';
    if (row.kind !== 'plan') return 'no';
    if (row.endedAt !== null) return 'no';
    const live: readonly string[] = LIVE_MEMBER_SUBSCRIPTION_STATUSES;
    if (!live.includes(row.status)) return 'no';

    const [other] = await db
      .select({ id: MemberSubscriptionTable.id })
      .from(MemberSubscriptionTable)
      .leftJoin(
        SubscriptionTable,
        eq(MemberSubscriptionTable.subscriptionId, SubscriptionTable.id),
      )
      .where(
        and(
          eq(MemberSubscriptionTable.subscriberType, row.subscriberType),
          eq(MemberSubscriptionTable.subscriberId, row.subscriberId),
          ne(MemberSubscriptionTable.id, memberSubscriptionId),
          isNull(MemberSubscriptionTable.endedAt),
          inArray(MemberSubscriptionTable.status, [
            ...LIVE_MEMBER_SUBSCRIPTION_STATUSES,
          ]),
          sql`coalesce(${SubscriptionTable.kind}::text, 'plan') = 'plan'`,
        ),
      )
      .limit(1);

    return other ? 'no' : 'yes';
  } catch (error) {
    logger.error('[plan-limit.wouldLeaveOrgPlanless] Error:', error);
    return 'unknown';
  }
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
 */
export async function outletDailyPrUsage(params: {
  outletId: string;
  shiftDate: string;
  excludeShiftId?: string;
}): Promise<number> {
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

    const [row] = await db
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
