import { and, desc, eq, isNotNull, sql, SQL } from 'drizzle-orm';
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
    if (filter?.type) conditions.push(eq(AdminRequestTable.type, filter.type));
    if (filter?.status) conditions.push(eq(AdminRequestTable.status, filter.status));
    if (filter?.subscriberType) conditions.push(eq(AdminRequestTable.subscriberType, filter.subscriberType));
    const requestedOn = buildMultiDayWhere(AdminRequestTable.createdAt, filter?.dates);
    if (requestedOn) conditions.push(requestedOn);
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async listPaginated(params: {
    filter?: AdminRequestFilter;
    page: number;
    pageSize: number;
  }): Promise<{ records: AdminRequest[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

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

  async countPending(): Promise<number> {
    try {
      const [row] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(AdminRequestTable)
        .where(eq(AdminRequestTable.status, 'pending'));
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
