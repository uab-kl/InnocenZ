import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import { OutletMemberTable, OutletMemberInsertType, OutletMemberType, OutletTable } from './outlet.model';

export type OutletMemberEnriched = OutletMemberType & {
  username: string;
  email: string | null;
  phoneNum: string | null;
};

/** One outlet membership joined to its outlet — used to resolve a signed-in
 * operator's own outlet + role at session start (mirrors the agency side). */
export type OutletMembershipWithOutlet = {
  membershipId: string;
  userId: string;
  outletId: string;
  outletName: string;
  subRole: OutletMemberType['subRole'];
  status: string;
};

export class OutletMemberRepositoryClass {
  async add(
    data: Omit<OutletMemberInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OutletMemberType> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient.insert(OutletMemberTable).values(data).returning();
      logger.info('[OutletMemberRepository.add] Member added:', member.id);
      return member;
    } catch (error) {
      logger.error('[OutletMemberRepository.add] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<OutletMemberInsertType>,
    tx?: DbTransaction,
  ): Promise<OutletMemberType | null> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient
        .update(OutletMemberTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OutletMemberTable.id, id))
        .returning();
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<OutletMemberType | null> {
    try {
      const [member] = await db
        .select()
        .from(OutletMemberTable)
        .where(eq(OutletMemberTable.id, id))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.getById] Error:', error);
      return null;
    }
  }

  async getByOutletAndUser(outletId: string, userId: string): Promise<OutletMemberType | null> {
    try {
      const [member] = await db
        .select()
        .from(OutletMemberTable)
        .where(
          and(
            eq(OutletMemberTable.outletId, outletId),
            eq(OutletMemberTable.userId, userId),
          ),
        )
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.getByOutletAndUser] Error:', error);
      return null;
    }
  }

  async listByOutlet(outletId: string): Promise<OutletMemberType[]> {
    try {
      return db
        .select()
        .from(OutletMemberTable)
        .where(eq(OutletMemberTable.outletId, outletId))
        .orderBy(OutletMemberTable.createdAt);
    } catch (error) {
      logger.error('[OutletMemberRepository.listByOutlet] Error:', error);
      return [];
    }
  }

  async listByOutletWithUser(outletId: string): Promise<OutletMemberEnriched[]> {
    try {
      return db
        .select({
          id: OutletMemberTable.id,
          outletId: OutletMemberTable.outletId,
          userId: OutletMemberTable.userId,
          subRole: OutletMemberTable.subRole,
          status: OutletMemberTable.status,
          createdAt: OutletMemberTable.createdAt,
          updatedAt: OutletMemberTable.updatedAt,
          createdBy: OutletMemberTable.createdBy,
          updatedBy: OutletMemberTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(OutletMemberTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletMemberTable.userId))
        .where(eq(OutletMemberTable.outletId, outletId))
        .orderBy(OutletMemberTable.createdAt);
    } catch (error) {
      logger.error('[OutletMemberRepository.listByOutletWithUser] Error:', error);
      return [];
    }
  }

  async listByUser(userId: string): Promise<OutletMemberType[]> {
    try {
      return db
        .select()
        .from(OutletMemberTable)
        .where(eq(OutletMemberTable.userId, userId));
    } catch (error) {
      logger.error('[OutletMemberRepository.listByUser] Error:', error);
      return [];
    }
  }

  /** Memberships (joined to their outlet) for the given users — resolves a
   * signed-in operator's own outlet + role at session start. */
  async listMembershipsByUserIds(
    userIds: string[],
    options: { status?: string } = {},
  ): Promise<OutletMembershipWithOutlet[]> {
    if (userIds.length === 0) return [];
    try {
      const conditions = [inArray(OutletMemberTable.userId, userIds)];
      if (options.status) {
        conditions.push(eq(OutletMemberTable.status, options.status));
      }
      const rows = await db
        .select({
          membershipId: OutletMemberTable.id,
          userId: OutletMemberTable.userId,
          outletId: OutletMemberTable.outletId,
          outletName: OutletTable.name,
          subRole: OutletMemberTable.subRole,
          status: OutletMemberTable.status,
        })
        .from(OutletMemberTable)
        .innerJoin(OutletTable, eq(OutletTable.id, OutletMemberTable.outletId))
        .where(and(...conditions))
        .orderBy(OutletTable.name);
      return rows;
    } catch (error) {
      logger.error('[OutletMemberRepository.listMembershipsByUserIds] Error:', error);
      return [];
    }
  }

  async remove(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(OutletMemberTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(OutletMemberTable.id, id));
      return true;
    } catch (error) {
      logger.error('[OutletMemberRepository.remove] Error:', error);
      return false;
    }
  }
}
