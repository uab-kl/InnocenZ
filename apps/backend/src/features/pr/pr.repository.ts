import { and, eq, exists, ilike, inArray, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { PrTable, PrInsertType, PrType, PrFilter } from './pr.model';

export class PrRepositoryClass {
  async create(
    data: Omit<PrInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<PrType> {
    try {
      const dbClient = tx ?? db;
      const [pr] = await dbClient.insert(PrTable).values(data).returning();
      logger.info('[PrRepository.create] PR created:', pr.id);
      return pr;
    } catch (error) {
      logger.error('[PrRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<PrInsertType>,
    tx?: DbTransaction,
  ): Promise<PrType | null> {
    try {
      const dbClient = tx ?? db;
      const [pr] = await dbClient
        .update(PrTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PrTable.id, id))
        .returning();
      // Empty result => row not found (a genuine null); a real DB error re-throws below.
      return pr ?? null;
    } catch (error) {
      logger.error('[PrRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<PrType | null> {
    try {
      const [pr] = await db.select().from(PrTable).where(eq(PrTable.id, id)).limit(1);
      return pr ?? null;
    } catch (error) {
      logger.error('[PrRepository.getById] Error:', error);
      throw error;
    }
  }

  async listPaginated(params: {
    filter?: PrFilter;
    page: number;
    pageSize: number;
  }): Promise<{ prs: PrType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(PrTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(PrTable.agencyId, filter.agencyId));
      if (filter?.status) conditions.push(eq(PrTable.status, filter.status));
      if (filter?.tier) conditions.push(eq(PrTable.tier, filter.tier));
      if (filter?.name) conditions.push(ilike(PrTable.name, `%${filter.name}%`));
      // Outlet callers only see PRs actually rostered at one of their venues.
      // An empty array must match nothing, not everything — guard before the join.
      if (filter?.assignedToOutletIds) {
        if (filter.assignedToOutletIds.length === 0) return { prs: [], totalCount: 0 };
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(ShiftAssignmentTable)
              .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
              .where(
                and(
                  eq(ShiftAssignmentTable.prId, PrTable.id),
                  inArray(ShiftTable.outletId, filter.assignedToOutletIds),
                ),
              ),
          ),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(PrTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const prs = await db
        .select()
        .from(PrTable)
        .where(whereClause)
        .orderBy(PrTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { prs, totalCount };
    } catch (error) {
      logger.error('[PrRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db.delete(PrTable).where(eq(PrTable.id, id)).returning({ id: PrTable.id });
      // No row => not found; a real DB error re-throws below.
      return !!row;
    } catch (error) {
      logger.error('[PrRepository.remove] Error:', error);
      throw error;
    }
  }
}
