import { and, desc, eq, gte, ilike, lte, or, sql, SQL } from 'drizzle-orm';
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
      const [row] = await dbClient.insert(MemberSubscriptionTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[MemberSubscriptionRepository.create] Error:', error);
      return null;
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
