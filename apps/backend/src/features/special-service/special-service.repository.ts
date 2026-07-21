import { and, asc, desc, eq, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { PrTable } from '@/features/pr/pr.model.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { buildMultiDayWhere } from '@/util/filter-date-format.js';
import {
  SpecialService,
  SpecialServiceFilter,
  SpecialServiceInsertType,
  SpecialServiceStatus,
  SpecialServiceWithOutlet,
  SpecialServiceTable,
} from './special-service.model.js';

export type StatusCountRow = {
  status: SpecialServiceStatus;
  count: number;
};

/**
 * Every special_service column plus the outlet's name. outlet_name used to be
 * stored on the row; migration 0035 dropped the copy, so it is joined from
 * main.outlet here and API responses keep the field unchanged.
 */
const selectWithOutlet = {
  id: SpecialServiceTable.id,
  outletId: SpecialServiceTable.outletId,
  outletName: OutletTable.name,
  title: SpecialServiceTable.title,
  category: SpecialServiceTable.category,
  description: SpecialServiceTable.description,
  budget: SpecialServiceTable.budget,
  currency: SpecialServiceTable.currency,
  status: SpecialServiceTable.status,
  initiatedBy: SpecialServiceTable.initiatedBy,
  adminAccepted: SpecialServiceTable.adminAccepted,
  postingAgencyId: SpecialServiceTable.postingAgencyId,
  postingAgencyName: SpecialServiceTable.postingAgencyName,
  postingPrId: SpecialServiceTable.postingPrId,
  postingPrName: PrTable.name,
  vendorName: SpecialServiceTable.vendorName,
  scheduledFor: SpecialServiceTable.scheduledFor,
  createdAt: SpecialServiceTable.createdAt,
  updatedAt: SpecialServiceTable.updatedAt,
  createdBy: SpecialServiceTable.createdBy,
  updatedBy: SpecialServiceTable.updatedBy,
};

export class SpecialServiceRepositoryClass {
  private buildConditions(filter?: SpecialServiceFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.outletId) conditions.push(eq(SpecialServiceTable.outletId, filter.outletId));
    if (filter?.status) conditions.push(eq(SpecialServiceTable.status, filter.status));
    if (filter?.category) conditions.push(eq(SpecialServiceTable.category, filter.category));
    if (filter?.vendorName) conditions.push(eq(SpecialServiceTable.vendorName, filter.vendorName));
    if (filter?.initiatedBy) conditions.push(eq(SpecialServiceTable.initiatedBy, filter.initiatedBy));
    if (filter?.postingPrId) conditions.push(eq(SpecialServiceTable.postingPrId, filter.postingPrId));
    if (filter?.adminAccepted)
      conditions.push(eq(SpecialServiceTable.adminAccepted, filter.adminAccepted));
    const requestedOn = buildMultiDayWhere(SpecialServiceTable.createdAt, filter?.dates);
    if (requestedOn) conditions.push(requestedOn);
    const scheduledOn = buildMultiDayWhere(SpecialServiceTable.scheduledFor, filter?.scheduledDates);
    if (scheduledOn) conditions.push(scheduledOn);
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async listPaginated(params: {
    filter?: SpecialServiceFilter;
    page: number;
    pageSize: number;
    /** Sort by requested time (createdAt). Defaults to newest first. */
    order?: 'asc' | 'desc';
  }): Promise<{ records: SpecialServiceWithOutlet[]; totalCount: number }> {
    try {
      const { filter, page, pageSize, order = 'desc' } = params;
      const whereClause = this.buildConditions(filter);

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(SpecialServiceTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const records = await db
        .select(selectWithOutlet)
        .from(SpecialServiceTable)
        .leftJoin(OutletTable, eq(OutletTable.id, SpecialServiceTable.outletId))
        .leftJoin(PrTable, eq(PrTable.id, SpecialServiceTable.postingPrId))
        .where(whereClause)
        .orderBy(
          order === 'asc'
            ? asc(SpecialServiceTable.createdAt)
            : desc(SpecialServiceTable.createdAt),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { records, totalCount };
    } catch (error) {
      logger.error('[SpecialServiceRepository.listPaginated] Error:', error);
      return { records: [], totalCount: 0 };
    }
  }

  async getById(id: string): Promise<SpecialServiceWithOutlet | null> {
    try {
      const [row] = await db
        .select(selectWithOutlet)
        .from(SpecialServiceTable)
        .leftJoin(OutletTable, eq(OutletTable.id, SpecialServiceTable.outletId))
        .leftJoin(PrTable, eq(PrTable.id, SpecialServiceTable.postingPrId))
        .where(eq(SpecialServiceTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[SpecialServiceRepository.getById] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<SpecialServiceInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<SpecialService | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient.insert(SpecialServiceTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[SpecialServiceRepository.create] Error:', error);
      return null;
    }
  }

  async update(
    id: string,
    data: Partial<SpecialServiceInsertType>,
    tx?: DbTransaction,
  ): Promise<SpecialService | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .update(SpecialServiceTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(SpecialServiceTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[SpecialServiceRepository.update] Error:', error);
      return null;
    }
  }

  // Count of orders grouped by status — drives the summary cards.
  async statusCounts(): Promise<StatusCountRow[]> {
    try {
      const rows = await db
        .select({
          status: SpecialServiceTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(SpecialServiceTable)
        .groupBy(SpecialServiceTable.status);
      return rows;
    } catch (error) {
      logger.error('[SpecialServiceRepository.statusCounts] Error:', error);
      return [];
    }
  }
}
