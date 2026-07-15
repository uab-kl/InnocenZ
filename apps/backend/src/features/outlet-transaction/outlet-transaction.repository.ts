import { and, desc, eq, gte, lte, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { Granularity, periodExpr } from '@/util/period.js';
import {
  OutletTransaction,
  OutletTransactionFilter,
  OutletTransactionInsertType,
  OutletTransactionTable,
} from './outlet-transaction.model.js';

export type PeriodVolumeRow = {
  period: string;
  total: string;
  count: number;
};

export class OutletTransactionRepositoryClass {
  private buildConditions(filter?: OutletTransactionFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.outletId) conditions.push(eq(OutletTransactionTable.outletId, filter.outletId));
    if (filter?.status) conditions.push(eq(OutletTransactionTable.status, filter.status));
    if (filter?.from) conditions.push(gte(OutletTransactionTable.occurredAt, filter.from));
    if (filter?.to) conditions.push(lte(OutletTransactionTable.occurredAt, filter.to));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async listPaginated(params: {
    filter?: OutletTransactionFilter;
    page: number;
    pageSize: number;
  }): Promise<{ records: OutletTransaction[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(OutletTransactionTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const records = await db
        .select()
        .from(OutletTransactionTable)
        .where(whereClause)
        .orderBy(desc(OutletTransactionTable.occurredAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { records, totalCount };
    } catch (error) {
      logger.error('[OutletTransactionRepository.listPaginated] Error:', error);
      return { records: [], totalCount: 0 };
    }
  }

  async getById(id: string): Promise<OutletTransaction | null> {
    try {
      const [row] = await db
        .select()
        .from(OutletTransactionTable)
        .where(eq(OutletTransactionTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[OutletTransactionRepository.getById] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<OutletTransactionInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OutletTransaction | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient.insert(OutletTransactionTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[OutletTransactionRepository.create] Error:', error);
      return null;
    }
  }

  // Transaction volume bucketed by the given granularity (day/week/month/year),
  // completed transactions unless the filter says otherwise.
  async volumeByPeriod(
    granularity: Granularity,
    filter?: OutletTransactionFilter,
  ): Promise<PeriodVolumeRow[]> {
    try {
      const whereClause = this.buildConditions(filter);
      const bucket = periodExpr(OutletTransactionTable.occurredAt, granularity);
      const rows = await db
        .select({
          period: bucket,
          total: sql<string>`coalesce(sum(${OutletTransactionTable.amount}), 0)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(OutletTransactionTable)
        .where(whereClause)
        .groupBy(bucket)
        .orderBy(bucket);
      return rows;
    } catch (error) {
      logger.error('[OutletTransactionRepository.volumeByPeriod] Error:', error);
      return [];
    }
  }
}
