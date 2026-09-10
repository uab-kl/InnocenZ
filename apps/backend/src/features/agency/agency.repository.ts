import { and, eq, getTableColumns, ilike, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { ActorUser, actorJoinOn, actorNameColumn } from '@/util/actor-name';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { AgencyTable, AgencyInsertType, AgencyType, AgencyFilter } from './agency.model';


/**
 * The row plus WHO LAST TOUCHED IT, by name.
 *
 * A separate exported type rather than widening the model: `updated_by_name`
 * is NOT a column and must never become one. It is resolved through a join on
 * every read, so a person who is later renamed reads correctly on every record
 * they ever touched — one fact, one table. See `util/actor-name.ts`.
 */
export type AgencyWithActor = AgencyType & { updatedByName: string | null };

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
  }): Promise<{ agencies: AgencyWithActor[]; totalCount: number }> {
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
        .select({ ...getTableColumns(AgencyTable), updatedByName: actorNameColumn })
        .from(AgencyTable)
        // WHO SWITCHED IT OFF, by name. LEFT and cast uuid->text, so a row
        // stamped `'system'` still appears — see `util/actor-name.ts`.
        .leftJoin(ActorUser, actorJoinOn(AgencyTable.updatedBy))
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

  /**
   * Active agencies for PR sign-up / join pickers — id, name, logo only.
   * No agencyCode / ssm / contacts (public unauthenticated list).
   */
  async listActiveNames(
    limit = 200,
  ): Promise<Array<{ id: string; name: string; logoImage: string | null }>> {
    try {
      const rows = await db
        .select({
          id: AgencyTable.id,
          name: AgencyTable.name,
          logoImage: AgencyTable.logoImage,
        })
        .from(AgencyTable)
        .where(eq(AgencyTable.status, 'active'))
        .orderBy(AgencyTable.name)
        .limit(limit);
      return rows;
    } catch (error) {
      logger.error('[AgencyRepository.listActiveNames] Error:', error);
      throw error;
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
