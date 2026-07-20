import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import {
  AgencyUserTable,
  AgencyUserInsertType,
  AgencyUserType,
  AgencyUserSubRole,
  AgencyTable,
} from './agency.model';

export type AgencyMemberEnriched = AgencyUserType & {
  username: string;
  email: string | null;
  phoneNum: string | null;
};

export type AgencyMembershipWithAgency = {
  membershipId: string;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  subRole: AgencyUserSubRole;
  status: string;
};

export type ListMembersOptions = {
  subRole?: AgencyUserSubRole;
  status?: string;
  search?: string;
};

export class AgencyMemberRepositoryClass {
  async add(
    data: Omit<AgencyUserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<AgencyUserType> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient.insert(AgencyUserTable).values(data).returning();
      logger.info('[AgencyMemberRepository.add] Member added:', member.id);
      return member;
    } catch (error) {
      logger.error('[AgencyMemberRepository.add] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<AgencyUserInsertType>,
    tx?: DbTransaction,
  ): Promise<AgencyUserType | null> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient
        .update(AgencyUserTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(AgencyUserTable.id, id))
        .returning();
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<AgencyUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyUserTable)
        .where(eq(AgencyUserTable.id, id))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.getById] Error:', error);
      return null;
    }
  }

  async getByAgencyAndUser(agencyId: string, userId: string): Promise<AgencyUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyUserTable)
        .where(and(eq(AgencyUserTable.agencyId, agencyId), eq(AgencyUserTable.userId, userId)))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.getByAgencyAndUser] Error:', error);
      return null;
    }
  }

  async listByAgency(
    agencyId: string,
    options: ListMembersOptions = {},
  ): Promise<AgencyMemberEnriched[]> {
    try {
      const conditions = [eq(AgencyUserTable.agencyId, agencyId)];
      if (options.subRole) {
        conditions.push(eq(AgencyUserTable.subRole, options.subRole));
      }
      if (options.status) {
        conditions.push(eq(AgencyUserTable.status, options.status));
      }
      if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`;
        conditions.push(
          or(
            ilike(UserTable.username, term),
            ilike(UserTable.email, term),
            ilike(UserTable.phoneNum, term),
          )!,
        );
      }

      return db
        .select({
          id: AgencyUserTable.id,
          agencyId: AgencyUserTable.agencyId,
          userId: AgencyUserTable.userId,
          subRole: AgencyUserTable.subRole,
          status: AgencyUserTable.status,
          createdAt: AgencyUserTable.createdAt,
          updatedAt: AgencyUserTable.updatedAt,
          createdBy: AgencyUserTable.createdBy,
          updatedBy: AgencyUserTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(AgencyUserTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyUserTable.userId))
        .where(and(...conditions))
        .orderBy(AgencyUserTable.createdAt);
    } catch (error) {
      logger.error('[AgencyMemberRepository.listByAgency] Error:', error);
      return [];
    }
  }

  async listByUser(userId: string): Promise<AgencyUserType[]> {
    try {
      return db
        .select()
        .from(AgencyUserTable)
        .where(eq(AgencyUserTable.userId, userId));
    } catch (error) {
      logger.error('[AgencyMemberRepository.listByUser] Error:', error);
      return [];
    }
  }

  async listMembershipsByUserIds(
    userIds: string[],
    options: { subRole?: AgencyUserSubRole; status?: string } = {},
  ): Promise<AgencyMembershipWithAgency[]> {
    if (userIds.length === 0) return [];

    try {
      const conditions = [inArray(AgencyUserTable.userId, userIds)];
      if (options.subRole) {
        conditions.push(eq(AgencyUserTable.subRole, options.subRole));
      }
      if (options.status) {
        conditions.push(eq(AgencyUserTable.status, options.status));
      }

      const rows = await db
        .select({
          membershipId: AgencyUserTable.id,
          userId: AgencyUserTable.userId,
          agencyId: AgencyUserTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          subRole: AgencyUserTable.subRole,
          status: AgencyUserTable.status,
        })
        .from(AgencyUserTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
        .where(and(...conditions))
        .orderBy(AgencyTable.name);

      return rows;
    } catch (error) {
      logger.error('[AgencyMemberRepository.listMembershipsByUserIds] Error:', error);
      return [];
    }
  }

  async remove(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(AgencyUserTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(AgencyUserTable.id, id));
      return true;
    } catch (error) {
      logger.error('[AgencyMemberRepository.remove] Error:', error);
      return false;
    }
  }

}
