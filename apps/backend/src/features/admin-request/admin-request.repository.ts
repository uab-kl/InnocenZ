import { and, desc, eq, inArray, isNotNull, ne, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { buildMultiDayWhere } from '@/util/filter-date-format.js';
import {
  AdminRequest,
  AdminRequestFilter,
  AdminRequestInsertType,
  AdminRequestTable,
} from './admin-request.model.js';

export type NegotiatedByRoleRow = {
  subscriberType: 'outlet' | 'agency' | null;
  count: number;
  total: string;
  average: string;
};

export class AdminRequestRepositoryClass {
  private buildConditions(filter?: AdminRequestFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.type) {
      conditions.push(
        Array.isArray(filter.type)
          ? inArray(AdminRequestTable.type, filter.type)
          : eq(AdminRequestTable.type, filter.type),
      );
    }
    if (filter?.excludeType) conditions.push(ne(AdminRequestTable.type, filter.excludeType));
    if (filter?.status) conditions.push(eq(AdminRequestTable.status, filter.status));
    if (filter?.subscriberType) conditions.push(eq(AdminRequestTable.subscriberType, filter.subscriberType));
    const requestedOn = buildMultiDayWhere(AdminRequestTable.createdAt, filter?.dates);
    if (requestedOn) conditions.push(requestedOn);
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * One row per subscriber — the most recent request only.
   *
   * A venue that taps "Switch to…" three times files three requests, and the
   * admin queue then shows three competing answers for the same venue, where
   * approving an older one would apply a plan the venue has since moved off.
   * Superseded requests are NOT deleted: they stay in the table as the record of
   * what was asked, they are simply not offered for action.
   *
   * Rows with no `subscriber_id` (a request that named no organisation) each
   * count as their own subscriber, so none of them swallow the others.
   */
  private async listLatestPerSubscriber(params: {
    whereClause: SQL | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ records: AdminRequest[]; totalCount: number }> {
    const { whereClause, page, pageSize } = params;
    const key = sql`coalesce(${AdminRequestTable.subscriberId}::text, ${AdminRequestTable.id}::text)`;

    // An OUTSTANDING request wins over an answered one, then the newest.
    // Without the first clause the row picked is whatever sorts first among
    // equal timestamps: a venue that filed two switches in the same minute and
    // had one approved could show the approved row in the admin queue while its
    // own screen showed the other still awaiting — the two screens reading the
    // same subscriber by different rules.
    const outstandingFirst = sql`(${AdminRequestTable.status} = 'pending') desc`;

    const latest = db
      .selectDistinctOn([sql`coalesce(${AdminRequestTable.subscriberId}::text, ${AdminRequestTable.id}::text)`])
      .from(AdminRequestTable)
      .where(whereClause)
      .orderBy(key, outstandingFirst, desc(AdminRequestTable.createdAt))
      .as('latest');

    const [countRow] = await db.select({ value: sql<number>`count(*)::int` }).from(latest);
    const totalCount = Number(countRow?.value ?? 0);

    const records = (await db
      .select()
      .from(latest)
      .orderBy(desc(latest.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as AdminRequest[];

    return { records, totalCount };
  }

  async listPaginated(params: {
    filter?: AdminRequestFilter;
    page: number;
    pageSize: number;
  }): Promise<{ records: AdminRequest[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

      if (filter?.latestPerSubscriber) {
        return await this.listLatestPerSubscriber({ whereClause, page, pageSize });
      }

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(AdminRequestTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const records = await db
        .select()
        .from(AdminRequestTable)
        .where(whereClause)
        .orderBy(desc(AdminRequestTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { records, totalCount };
    } catch (error) {
      logger.error('[AdminRequestRepository.listPaginated] Error:', error);
      return { records: [], totalCount: 0 };
    }
  }

  /** The newest plan change still awaiting an admin, for these subscribers. */
  async latestPendingPlanChange(subscriberIds: string[]): Promise<AdminRequest | null> {
    try {
      if (subscriberIds.length === 0) return null;
      const [row] = await db
        .select()
        .from(AdminRequestTable)
        .where(
          and(
            eq(AdminRequestTable.type, 'plan_change'),
            eq(AdminRequestTable.status, 'pending'),
            inArray(AdminRequestTable.subscriberId, subscriberIds),
          ),
        )
        .orderBy(desc(AdminRequestTable.createdAt))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.latestPendingPlanChange] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<AdminRequest | null> {
    try {
      const [row] = await db.select().from(AdminRequestTable).where(eq(AdminRequestTable.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.getById] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<AdminRequestInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<AdminRequest | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient.insert(AdminRequestTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.create] Error:', error);
      return null;
    }
  }

  async update(
    id: string,
    data: Partial<AdminRequestInsertType>,
    tx?: DbTransaction,
  ): Promise<AdminRequest | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .update(AdminRequestTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(AdminRequestTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AdminRequestRepository.update] Error:', error);
      return null;
    }
  }

  async countPending(
    filter?: Pick<AdminRequestFilter, 'type' | 'excludeType'>,
  ): Promise<number> {
    try {
      const conditions: SQL[] = [eq(AdminRequestTable.status, 'pending')];
      if (filter?.type) {
        conditions.push(
          Array.isArray(filter.type)
            ? inArray(AdminRequestTable.type, filter.type)
            : eq(AdminRequestTable.type, filter.type),
        );
      }
      if (filter?.excludeType) conditions.push(ne(AdminRequestTable.type, filter.excludeType));
      const [row] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(AdminRequestTable)
        .where(and(...conditions));
      return Number(row?.value ?? 0);
    } catch (error) {
      logger.error('[AdminRequestRepository.countPending] Error:', error);
      return 0;
    }
  }

  // Successfully negotiated prices (resolved requests that carry a quoted amount),
  // aggregated by subscriber role (outlet vs agency).
  async negotiatedByRole(): Promise<NegotiatedByRoleRow[]> {
    try {
      const rows = await db
        .select({
          subscriberType: AdminRequestTable.subscriberType,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${AdminRequestTable.quotedAmount}), 0)::text`,
          average: sql<string>`coalesce(round(avg(${AdminRequestTable.quotedAmount}), 2), 0)::text`,
        })
        .from(AdminRequestTable)
        .where(and(eq(AdminRequestTable.status, 'resolved'), isNotNull(AdminRequestTable.quotedAmount)))
        .groupBy(AdminRequestTable.subscriberType);
      return rows;
    } catch (error) {
      logger.error('[AdminRequestRepository.negotiatedByRole] Error:', error);
      return [];
    }
  }
}
