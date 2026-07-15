import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import {
  AgencyMemberTable,
  AgencyMemberInsertType,
  AgencyMemberType,
  AgencyMemberSubRole,
  AgencyTable,
} from './agency.model';

export type AgencyMemberEnriched = AgencyMemberType & {
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
  subRole: AgencyMemberSubRole;
  status: string;
};

export type ListMembersOptions = {
  subRole?: AgencyMemberSubRole;
  status?: string;
  search?: string;
};

export class AgencyMemberRepositoryClass {
  async add(
    data: Omit<AgencyMemberInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<AgencyMemberType> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient.insert(AgencyMemberTable).values(data).returning();
      logger.info('[AgencyMemberRepository.add] Member added:', member.id);
      return member;
    } catch (error) {
      logger.error('[AgencyMemberRepository.add] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<AgencyMemberInsertType>,
    tx?: DbTransaction,
  ): Promise<AgencyMemberType | null> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient
        .update(AgencyMemberTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(AgencyMemberTable.id, id))
        .returning();
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<AgencyMemberType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyMemberTable)
        .where(eq(AgencyMemberTable.id, id))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.getById] Error:', error);
      return null;
    }
  }

  async getByAgencyAndUser(agencyId: string, userId: string): Promise<AgencyMemberType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyMemberTable)
        .where(and(eq(AgencyMemberTable.agencyId, agencyId), eq(AgencyMemberTable.userId, userId)))
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
      const conditions = [eq(AgencyMemberTable.agencyId, agencyId)];
      if (options.subRole) {
        conditions.push(eq(AgencyMemberTable.subRole, options.subRole));
      }
      if (options.status) {
        conditions.push(eq(AgencyMemberTable.status, options.status));
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
          id: AgencyMemberTable.id,
          agencyId: AgencyMemberTable.agencyId,
          userId: AgencyMemberTable.userId,
          subRole: AgencyMemberTable.subRole,
          status: AgencyMemberTable.status,
          createdAt: AgencyMemberTable.createdAt,
          updatedAt: AgencyMemberTable.updatedAt,
          createdBy: AgencyMemberTable.createdBy,
          updatedBy: AgencyMemberTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(AgencyMemberTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyMemberTable.userId))
        .where(and(...conditions))
        .orderBy(AgencyMemberTable.createdAt);
    } catch (error) {
      logger.error('[AgencyMemberRepository.listByAgency] Error:', error);
      return [];
    }
  }

  async listByUser(userId: string): Promise<AgencyMemberType[]> {
    try {
      return db
        .select()
        .from(AgencyMemberTable)
        .where(eq(AgencyMemberTable.userId, userId));
    } catch (error) {
      logger.error('[AgencyMemberRepository.listByUser] Error:', error);
      return [];
    }
  }

  async listMembershipsByUserIds(
    userIds: string[],
    options: { subRole?: AgencyMemberSubRole; status?: string } = {},
  ): Promise<AgencyMembershipWithAgency[]> {
    if (userIds.length === 0) return [];

    try {
      const conditions = [inArray(AgencyMemberTable.userId, userIds)];
      if (options.subRole) {
        conditions.push(eq(AgencyMemberTable.subRole, options.subRole));
      }
      if (options.status) {
        conditions.push(eq(AgencyMemberTable.status, options.status));
      }

      const rows = await db
        .select({
          membershipId: AgencyMemberTable.id,
          userId: AgencyMemberTable.userId,
          agencyId: AgencyMemberTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          subRole: AgencyMemberTable.subRole,
          status: AgencyMemberTable.status,
        })
        .from(AgencyMemberTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyMemberTable.agencyId))
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
        .update(AgencyMemberTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(AgencyMemberTable.id, id));
      return true;
    } catch (error) {
      logger.error('[AgencyMemberRepository.remove] Error:', error);
      return false;
    }
  }

}
