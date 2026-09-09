import { and, desc, eq, gte, ilike, isNull, lte, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { Granularity, periodExpr } from '@/util/period.js';
import {
  MemberSubscription,
  MemberSubscriptionFilter,
  MemberSubscriptionInsertType,
  MemberSubscriptionTable,
} from './member-subscription.model.js';

export type PeriodRevenueRow = {
  period: string;
  subscriberType: 'outlet' | 'agency';
  total: string;
  count: number;
};

function dayBounds(isoDay: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
  const start = new Date(`${isoDay}T00:00:00`);
  const end = new Date(`${isoDay}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export class MemberSubscriptionRepositoryClass {
  private buildConditions(filter?: MemberSubscriptionFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.subscriberType) conditions.push(eq(MemberSubscriptionTable.subscriberType, filter.subscriberType));
    if (filter?.subscriberId) conditions.push(eq(MemberSubscriptionTable.subscriberId, filter.subscriberId));
    if (filter?.subscriptionId) conditions.push(eq(MemberSubscriptionTable.subscriptionId, filter.subscriptionId));
    if (filter?.status) conditions.push(eq(MemberSubscriptionTable.status, filter.status));
    if (filter?.search) conditions.push(ilike(MemberSubscriptionTable.subscriberName, `%${filter.search}%`));
    // Plans and add-ons share this ledger, told apart by the product they
    // reference. Legacy rows with no subscription_id count as plans — they
    // predate add-ons entirely.
    if (filter?.kind) {
      conditions.push(
        filter.kind === 'plan'
          ? sql`(${MemberSubscriptionTable.subscriptionId} is null or exists (
              select 1 from "main"."subscription" s
              where s.id = ${MemberSubscriptionTable.subscriptionId} and s.kind = 'plan'))`
          : sql`exists (
              select 1 from "main"."subscription" s
              where s.id = ${MemberSubscriptionTable.subscriptionId} and s.kind = 'addon')`,
      );
    }

    if (filter?.dates && filter.dates.length > 0) {
      const dayClauses = filter.dates
        .map((day) => dayBounds(day))
        .filter((bounds): bounds is { start: Date; end: Date } => bounds !== null)
        .map(({ start, end }) =>
          and(
            gte(MemberSubscriptionTable.startedAt, start),
            lte(MemberSubscriptionTable.startedAt, end),
          ),
        );
      if (dayClauses.length > 0) {
        conditions.push(or(...dayClauses)!);
      }
    } else {
      if (filter?.from) conditions.push(gte(MemberSubscriptionTable.startedAt, filter.from));
      if (filter?.to) conditions.push(lte(MemberSubscriptionTable.startedAt, filter.to));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * One row per subscriber — the plan it is on NOW.
   *
   * A switch closes the old row and opens a new one, so a venue accumulates a
   * row per plan it has held. Admin History wants the current picture, not the
   * whole trail: keep the newest by `started_at`. Nothing is deleted; the older
   * rows remain the record of what was charged before.
   */
  private async listLatestPerSubscriber(params: {
    whereClause: SQL | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ records: MemberSubscription[]; totalCount: number }> {
    const { whereClause, page, pageSize } = params;

    const latest = db
      .selectDistinctOn([MemberSubscriptionTable.subscriberType, MemberSubscriptionTable.subscriberId])
      .from(MemberSubscriptionTable)
      .where(whereClause)
      .orderBy(
        MemberSubscriptionTable.subscriberType,
        MemberSubscriptionTable.subscriberId,
        desc(MemberSubscriptionTable.startedAt),
      )
      .as('latest');

    const [countRow] = await db.select({ value: sql<number>`count(*)::int` }).from(latest);
    const totalCount = Number(countRow?.value ?? 0);

    const records = (await db
      .select()
      .from(latest)
      .orderBy(desc(latest.startedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as MemberSubscription[];

    return { records, totalCount };
  }

  async listPaginated(params: {
    filter?: MemberSubscriptionFilter;
    page: number;
    pageSize: number;
  }): Promise<{ records: MemberSubscription[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

      if (filter?.latestPerSubscriber) {
        return await this.listLatestPerSubscriber({ whereClause, page, pageSize });
      }

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(MemberSubscriptionTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const records = await db
        .select()
        .from(MemberSubscriptionTable)
        .where(whereClause)
        .orderBy(desc(MemberSubscriptionTable.startedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { records, totalCount };
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.listPaginated] Error:', error);
      return { records: [], totalCount: 0 };
    }
  }

  async getById(id: string): Promise<MemberSubscription | null> {
    try {
      const [row] = await db
        .select()
        .from(MemberSubscriptionTable)
        .where(eq(MemberSubscriptionTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.getById] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<MemberSubscriptionInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<MemberSubscription | null> {
    try {
      const dbClient = tx ?? db;
      /**
       * BILLABLE FROM THE START UNLESS THE CALLER SAYS OTHERWISE.
       *
       * `billing_starts_at` NULL means "enrolled, not yet billable" (0157), and
       * that is a state exactly one door may create: `enrolOrgOnPlan`, which
       * passes it explicitly because the org it is enrolling is `pending_review`
       * and awaiting an admin. Every other caller — a plan switch, an add-on, a
       * seed — omits the key entirely and must keep billing as it does today.
       *
       * Defaulted HERE rather than left to each caller: the failure mode of
       * forgetting it is an org that is silently never invoiced, which nothing
       * reports. `in` rather than `??`, so an explicit null is honoured while an
       * absent key is not.
       */
      const values = {
        ...data,
        billingStartsAt:
          'billingStartsAt' in data ? data.billingStartsAt : (data.startedAt ?? new Date()),
      };
      const [row] = await dbClient.insert(MemberSubscriptionTable).values(values).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.create] Error:', error);
      return null;
    }
  }

  /**
   * Start the billing meter for every lane of an org that is still waiting on
   * one — what admin approval does to the ledger. Returns the rows it stamped.
   *
   * `billing_starts_at IS NULL` is the whole guard, and it is what makes this
   * safe on the `/approve` route: that route is ALSO the reactivation path for a
   * suspended org ("Reactivation is `/approve`", outlet.routes.ts), and a
   * suspended org's lanes are already stamped. Re-anchoring them would move a
   * paying customer's billing day every time it was suspended and restored.
   * Nothing to stamp returns an empty array, which the caller reads as "already
   * billing" and does no further work.
   *
   * `ended_at IS NULL` keeps history out of it: a closed row is the far side of
   * a plan switch, and stamping it would invent an anchor for a lane nobody is
   * on. Add-on lanes ARE included — a venue approved holding a POS add-on should
   * start paying for both on the same day.
   *
   * ⚠️ RETURNS `null` WHEN THE WRITE FAILED, which is NOT the same as `[]`.
   * An empty array means "nothing needed stamping" — the ordinary outcome of
   * re-approving an org that is already billing. `null` means the update threw,
   * and that one does not heal: an unstamped lane has no anchor, so the nightly
   * job skips it tonight and every night after. Collapsing the two into `[]`
   * (as this first did) hid the only failure here that is permanent — the same
   * `none`-vs-`unknown` conflation `PlanLookup` exists to prevent.
   */
  async startBilling(params: {
    subscriberType: 'agency' | 'outlet';
    subscriberId: string;
    at: Date;
    actor: string;
    tx?: DbTransaction;
  }): Promise<string[] | null> {
    try {
      const dbClient = params.tx ?? db;
      const rows = await dbClient
        .update(MemberSubscriptionTable)
        .set({
          billingStartsAt: params.at,
          updatedAt: new Date(),
          updatedBy: params.actor,
        })
        .where(
          and(
            eq(MemberSubscriptionTable.subscriberType, params.subscriberType),
            eq(MemberSubscriptionTable.subscriberId, params.subscriberId),
            isNull(MemberSubscriptionTable.billingStartsAt),
            isNull(MemberSubscriptionTable.endedAt),
          ),
        )
        .returning({ id: MemberSubscriptionTable.id });
      return rows.map((row) => row.id);
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.startBilling] Error:', error);
      return null;
    }
  }

  /**
   * Orgs that are APPROVED but hold a subscription lane with no billing anchor —
   * the state that cannot heal on its own.
   *
   * `billing_starts_at` is written in exactly two places: `create()` defaults it,
   * and `/approve` stamps it. If that stamp ever fails, the org is live, working,
   * and invoiced by nothing — and the nightly job cannot rescue it, because a
   * lane with no anchor is precisely what that job is built to skip.
   *
   * So it is REPORTED instead. This codebase has already paid for the other
   * approach once: orgs came to exist holding no subscription at all because a
   * write logged a warning and carried on, and the reason nobody noticed for
   * weeks is that nothing ever asked the question. This is the question, asked
   * every morning by the invoice job.
   *
   * Deliberately NOT self-healing. Stamping `now` here would silently bill an
   * org from the day the reconciliation happened to run rather than the day it
   * was approved — inventing a date, which is worse than naming a problem.
   */
  async listApprovedWithoutBillingAnchor(): Promise<
    Array<{ subscriberType: string; subscriberId: string; subscriberName: string }>
  > {
    try {
      const result = await db.execute(sql`
        select distinct m.subscriber_type as "subscriberType",
               m.subscriber_id   as "subscriberId",
               m.subscriber_name as "subscriberName"
          from main.member_subscription m
          left join main.outlet o
                 on m.subscriber_type = 'outlet' and o.id = m.subscriber_id
          left join main.agency a
                 on m.subscriber_type = 'agency' and a.id = m.subscriber_id
         where m.billing_starts_at is null
           and m.ended_at is null
           and m.status in ('active', 'past_due')
           -- APPROVED is the point: a pending org holding no anchor is correct,
           -- it is the whole design. Only a LIVE org with no anchor is a hole.
           and coalesce(o.status::text, a.status::text) = 'active'
      `);
      const rows = (result.rows ?? result) as Array<{
        subscriberType: string;
        subscriberId: string;
        subscriberName: string;
      }>;
      return rows;
    } catch (error) {
      logger.error(
        '[MemberSubscriptionRepository.listApprovedWithoutBillingAnchor] Error:',
        error,
      );
      // A failed CHECK must not read as "all clear" — the caller logs the
      // difference rather than printing a reassuring zero.
      return [];
    }
  }

  async update(
    id: string,
    data: Partial<MemberSubscriptionInsertType>,
    tx?: DbTransaction,
  ): Promise<MemberSubscription | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .update(MemberSubscriptionTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(MemberSubscriptionTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.update] Error:', error);
      return null;
    }
  }

  // Subscription revenue bucketed by the given granularity (day/week/month/year),
  // split by subscriber type, ordered oldest -> newest.
  async revenueByPeriod(
    granularity: Granularity,
    filter?: MemberSubscriptionFilter,
  ): Promise<PeriodRevenueRow[]> {
    try {
      const whereClause = this.buildConditions(filter);
      const bucket = periodExpr(MemberSubscriptionTable.startedAt, granularity);
      const rows = await db
        .select({
          period: bucket,
          subscriberType: MemberSubscriptionTable.subscriberType,
          total: sql<string>`coalesce(sum(${MemberSubscriptionTable.amount}), 0)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(MemberSubscriptionTable)
        .where(whereClause)
        .groupBy(bucket, MemberSubscriptionTable.subscriberType)
        .orderBy(bucket);
      return rows;
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.revenueByPeriod] Error:', error);
      return [];
    }
  }
}
