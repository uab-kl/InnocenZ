import { and, asc, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { PrTable } from '@/features/pr/pr.model';
import {
  ShiftSaleTable,
  ShiftSaleInsertType,
  ShiftSaleType,
  ShiftSaleFilter,
  ShiftSaleDayTotals,
  ShiftSalePrTotals,
} from './shift-sale.model';

export class ShiftSaleRepositoryClass {
  private buildConditions(filter?: ShiftSaleFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.outletId) conditions.push(eq(ShiftSaleTable.outletId, filter.outletId));
    if (filter?.agencyId) conditions.push(eq(ShiftSaleTable.agencyId, filter.agencyId));
    if (filter?.shiftId) conditions.push(eq(ShiftSaleTable.shiftId, filter.shiftId));
    if (filter?.prId) conditions.push(eq(ShiftSaleTable.prId, filter.prId));
    if (filter?.outletIds) {
      // An empty array must match nothing, not everything — caller guards this.
      conditions.push(inArray(ShiftSaleTable.outletId, filter.outletIds));
    }
    if (filter?.fromDate) conditions.push(gte(ShiftSaleTable.soldOn, filter.fromDate));
    if (filter?.toDate) conditions.push(lte(ShiftSaleTable.soldOn, filter.toDate));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Insert or update the (shift, PR) sales row — the Today panel re-logs the same
   * PR's running totals, so a repeat write must overwrite rather than duplicate.
   */
  async upsert(
    data: Omit<ShiftSaleInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<ShiftSaleType | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .insert(ShiftSaleTable)
        .values(data)
        .onConflictDoUpdate({
          target: [ShiftSaleTable.shiftId, ShiftSaleTable.prId],
          set: {
            drinkUnits: data.drinkUnits,
            drinkSalesRm: data.drinkSalesRm,
            tipUnits: data.tipUnits,
            tipSalesRm: data.tipSalesRm,
            tableSalesRm: data.tableSalesRm,
            totalSalesRm: data.totalSalesRm,
            soldOn: data.soldOn,
            updatedAt: new Date(),
            updatedBy: data.updatedBy,
          },
        })
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[ShiftSaleRepository.upsert] Error:', error);
      return null;
    }
  }

  async list(filter?: ShiftSaleFilter): Promise<ShiftSaleType[]> {
    try {
      if (filter?.outletIds && filter.outletIds.length === 0) return [];
      const whereClause = this.buildConditions(filter);
      return await db
        .select()
        .from(ShiftSaleTable)
        .where(whereClause)
        .orderBy(asc(ShiftSaleTable.soldOn));
    } catch (error) {
      logger.error('[ShiftSaleRepository.list] Error:', error);
      return [];
    }
  }

  async getById(id: string): Promise<ShiftSaleType | null> {
    try {
      const [row] = await db.select().from(ShiftSaleTable).where(eq(ShiftSaleTable.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[ShiftSaleRepository.getById] Error:', error);
      return null;
    }
  }

  // Floor sales grouped by day — powers the report chart / daily breakdown.
  async reportByDay(filter?: ShiftSaleFilter): Promise<ShiftSaleDayTotals[]> {
    try {
      if (filter?.outletIds && filter.outletIds.length === 0) return [];
      const whereClause = this.buildConditions(filter);
      const rows = await db
        .select({
          soldOn: ShiftSaleTable.soldOn,
          drinkSalesRm: sql<number>`coalesce(sum(${ShiftSaleTable.drinkSalesRm}), 0)::float8`,
          tipSalesRm: sql<number>`coalesce(sum(${ShiftSaleTable.tipSalesRm}), 0)::float8`,
          tableSalesRm: sql<number>`coalesce(sum(${ShiftSaleTable.tableSalesRm}), 0)::float8`,
          totalSalesRm: sql<number>`coalesce(sum(${ShiftSaleTable.totalSalesRm}), 0)::float8`,
        })
        .from(ShiftSaleTable)
        .where(whereClause)
        .groupBy(ShiftSaleTable.soldOn)
        .orderBy(asc(ShiftSaleTable.soldOn));
      return rows.map((r) => ({
        soldOn: r.soldOn,
        drinkSalesRm: Number(r.drinkSalesRm),
        tipSalesRm: Number(r.tipSalesRm),
        tableSalesRm: Number(r.tableSalesRm),
        totalSalesRm: Number(r.totalSalesRm),
      }));
    } catch (error) {
      logger.error('[ShiftSaleRepository.reportByDay] Error:', error);
      return [];
    }
  }

  // Floor sales grouped by PR (name joined) — powers "Top performing PRs".
  async reportByPr(filter?: ShiftSaleFilter): Promise<ShiftSalePrTotals[]> {
    try {
      if (filter?.outletIds && filter.outletIds.length === 0) return [];
      const whereClause = this.buildConditions(filter);
      const rows = await db
        .select({
          prId: ShiftSaleTable.prId,
          prName: PrTable.name,
          totalSalesRm: sql<number>`coalesce(sum(${ShiftSaleTable.totalSalesRm}), 0)::float8`,
        })
        .from(ShiftSaleTable)
        .leftJoin(PrTable, eq(PrTable.id, ShiftSaleTable.prId))
        .where(whereClause)
        .groupBy(ShiftSaleTable.prId, PrTable.name)
        .orderBy(sql`3 desc`);
      return rows.map((r) => ({
        prId: r.prId,
        prName: r.prName,
        totalSalesRm: Number(r.totalSalesRm),
      }));
    } catch (error) {
      logger.error('[ShiftSaleRepository.reportByPr] Error:', error);
      return [];
    }
  }
}
