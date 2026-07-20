import { and, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftTable, ShiftInsertType, ShiftType, ShiftFilter } from './shift.model';

export class ShiftRepositoryClass {
  async create(
    data: Omit<ShiftInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<ShiftType> {
    try {
      const dbClient = tx ?? db;
      const [shift] = await dbClient.insert(ShiftTable).values(data).returning();
      logger.info('[ShiftRepository.create] Shift created:', shift.id);
      return shift;
    } catch (error) {
      logger.error('[ShiftRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<ShiftInsertType>,
    tx?: DbTransaction,
  ): Promise<ShiftType | null> {
    try {
      const dbClient = tx ?? db;
      const [shift] = await dbClient
        .update(ShiftTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ShiftTable.id, id))
        .returning();
      return shift ?? null;
    } catch (error) {
      logger.error('[ShiftRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<ShiftType | null> {
    try {
      const [shift] = await db.select().from(ShiftTable).where(eq(ShiftTable.id, id)).limit(1);
      return shift ?? null;
    } catch (error) {
      logger.error('[ShiftRepository.getById] Error:', error);
      throw error;
    }
  }

  async listPaginated(params: {
    filter?: ShiftFilter;
    page: number;
    pageSize: number;
  }): Promise<{ shifts: ShiftType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(ShiftTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(ShiftTable.agencyId, filter.agencyId));
      if (filter?.outletId) conditions.push(eq(ShiftTable.outletId, filter.outletId));
      // An empty array must match nothing, not everything — guard before inArray.
      if (filter?.outletIds) {
        if (filter.outletIds.length === 0) return { shifts: [], totalCount: 0 };
        conditions.push(inArray(ShiftTable.outletId, filter.outletIds));
      }
      if (filter?.status) conditions.push(eq(ShiftTable.status, filter.status));
      if (filter?.eventKind) conditions.push(eq(ShiftTable.eventKind, filter.eventKind));
      if (filter?.fromDate) conditions.push(gte(ShiftTable.shiftDate, filter.fromDate));
      if (filter?.toDate) conditions.push(lte(ShiftTable.shiftDate, filter.toDate));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(ShiftTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const shifts = await db
        .select()
        .from(ShiftTable)
        .where(whereClause)
        .orderBy(ShiftTable.shiftDate)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { shifts, totalCount };
    } catch (error) {
      logger.error('[ShiftRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db.delete(ShiftTable).where(eq(ShiftTable.id, id)).returning({ id: ShiftTable.id });
      return !!row;
    } catch (error) {
      logger.error('[ShiftRepository.remove] Error:', error);
      throw error;
    }
  }
}
