import { and, eq, ilike, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { OutletTable, OutletInsertType, OutletType, OutletFilter } from './outlet.model';

export class OutletRepositoryClass {
  async create(
    data: Omit<OutletInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OutletType> {
    try {
      const dbClient = tx ?? db;
      const [outlet] = await dbClient.insert(OutletTable).values(data).returning();
      logger.info('[OutletRepository.create] Outlet created:', outlet.id);
      return outlet;
    } catch (error) {
      logger.error('[OutletRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<OutletInsertType>,
    tx?: DbTransaction,
  ): Promise<OutletType | null> {
    try {
      const dbClient = tx ?? db;
      const [outlet] = await dbClient
        .update(OutletTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OutletTable.id, id))
        .returning();
      return outlet ?? null;
    } catch (error) {
      logger.error('[OutletRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<OutletType | null> {
    try {
      const [outlet] = await db
        .select()
        .from(OutletTable)
        .where(eq(OutletTable.id, id))
        .limit(1);
      return outlet ?? null;
    } catch (error) {
      logger.error('[OutletRepository.getById] Error:', error);
      return null;
    }
  }

  async listPaginated(params: {
    filter?: OutletFilter;
    page: number;
    pageSize: number;
  }): Promise<{ outlets: OutletType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(OutletTable.id, filter.id));
      if (filter?.status) conditions.push(eq(OutletTable.status, filter.status));
      if (filter?.name) conditions.push(ilike(OutletTable.name, `%${filter.name}%`));
      if (filter?.onboardedByAgencyId) conditions.push(eq(OutletTable.onboardedByAgencyId, filter.onboardedByAgencyId));
      if (filter?.subscriptionId) conditions.push(eq(OutletTable.subscriptionId, filter.subscriptionId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(OutletTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const outlets = await db
        .select()
        .from(OutletTable)
        .where(whereClause)
        .orderBy(OutletTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { outlets, totalCount };
    } catch (error) {
      logger.error('[OutletRepository.listPaginated] Error:', error);
      return { outlets: [], totalCount: 0 };
    }
  }
}
