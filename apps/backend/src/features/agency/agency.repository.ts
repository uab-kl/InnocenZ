import { and, eq, ilike, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { AgencyTable, AgencyInsertType, AgencyType, AgencyFilter } from './agency.model';

export class AgencyRepositoryClass {
  async create(
    data: Omit<AgencyInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<AgencyType> {
    try {
      const dbClient = tx ?? db;
      const [agency] = await dbClient.insert(AgencyTable).values(data).returning();
      logger.info('[AgencyRepository.create] Agency created:', agency.id);
      return agency;
    } catch (error) {
      logger.error('[AgencyRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<AgencyInsertType>,
    tx?: DbTransaction,
  ): Promise<AgencyType | null> {
    try {
      const dbClient = tx ?? db;
      const [agency] = await dbClient
        .update(AgencyTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(AgencyTable.id, id))
        .returning();
      return agency ?? null;
    } catch (error) {
      logger.error('[AgencyRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<AgencyType | null> {
    try {
      const [agency] = await db
        .select()
        .from(AgencyTable)
        .where(eq(AgencyTable.id, id))
        .limit(1);
      return agency ?? null;
    } catch (error) {
      logger.error('[AgencyRepository.getById] Error:', error);
      return null;
    }
  }

  async getByCode(code: string): Promise<AgencyType | null> {
    try {
      const [agency] = await db
        .select()
        .from(AgencyTable)
        .where(eq(AgencyTable.agencyCode, code))
        .limit(1);
      return agency ?? null;
    } catch (error) {
      logger.error('[AgencyRepository.getByCode] Error:', error);
      return null;
    }
  }

  async listPaginated(params: {
    filter?: AgencyFilter;
    page: number;
    pageSize: number;
  }): Promise<{ agencies: AgencyType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(AgencyTable.id, filter.id));
      if (filter?.agencyCode) conditions.push(eq(AgencyTable.agencyCode, filter.agencyCode));
      if (filter?.status) conditions.push(eq(AgencyTable.status, filter.status));
      if (filter?.name) conditions.push(ilike(AgencyTable.name, `%${filter.name}%`));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(AgencyTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const agencies = await db
        .select()
        .from(AgencyTable)
        .where(whereClause)
        .orderBy(AgencyTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { agencies, totalCount };
    } catch (error) {
      logger.error('[AgencyRepository.listPaginated] Error:', error);
      return { agencies: [], totalCount: 0 };
    }
  }

  async generateUniqueCode(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await this.getByCode(code);
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique agency code');
  }
}
