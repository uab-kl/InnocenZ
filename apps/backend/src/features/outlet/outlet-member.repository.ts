import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import { OutletUserTable, OutletUserInsertType, OutletUserType, OutletTable } from './outlet.model';

export type OutletMemberEnriched = OutletUserType & {
  username: string;
  email: string | null;
  phoneNum: string | null;
};

/** One outlet membership joined to its outlet — used to resolve a signed-in
 * operator's own outlet + role at session start (mirrors the agency side).
 * `outletStatus` is the organisation's status (`pending_review` / `active` / …),
 * distinct from the membership row's own `status`. */
export type OutletMembershipWithOutlet = {
  membershipId: string;
  userId: string;
  outletId: string;
  outletName: string;
  outletStatus: string;
  subRole: OutletUserType['subRole'];
  status: string;
};

export class OutletMemberRepositoryClass {
  async add(
    data: Omit<OutletUserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OutletUserType> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient.insert(OutletUserTable).values(data).returning();
      logger.info('[OutletMemberRepository.add] Member added:', member.id);
      return member;
    } catch (error) {
      logger.error('[OutletMemberRepository.add] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<OutletUserInsertType>,
    tx?: DbTransaction,
  ): Promise<OutletUserType | null> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient
        .update(OutletUserTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OutletUserTable.id, id))
        .returning();
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<OutletUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(OutletUserTable)
        .where(eq(OutletUserTable.id, id))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.getById] Error:', error);
      return null;
    }
  }

  async getByOutletAndUser(outletId: string, userId: string): Promise<OutletUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(OutletUserTable)
        .where(
          and(
            eq(OutletUserTable.outletId, outletId),
            eq(OutletUserTable.userId, userId),
          ),
        )
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.getByOutletAndUser] Error:', error);
      return null;
    }
  }

  async listByOutlet(outletId: string): Promise<OutletUserType[]> {
    try {
      return db
        .select()
        .from(OutletUserTable)
        .where(eq(OutletUserTable.outletId, outletId))
        .orderBy(OutletUserTable.createdAt);
    } catch (error) {
      logger.error('[OutletMemberRepository.listByOutlet] Error:', error);
      return [];
    }
  }

  async listByOutletWithUser(outletId: string): Promise<OutletMemberEnriched[]> {
    try {
      return db
        .select({
          id: OutletUserTable.id,
          outletId: OutletUserTable.outletId,
          userId: OutletUserTable.userId,
          subRole: OutletUserTable.subRole,
          status: OutletUserTable.status,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(OutletUserTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
        .where(eq(OutletUserTable.outletId, outletId))
        .orderBy(OutletUserTable.createdAt);
    } catch (error) {
      logger.error('[OutletMemberRepository.listByOutletWithUser] Error:', error);
      return [];
    }
  }

  async listByUser(userId: string): Promise<OutletUserType[]> {
    try {
      return db
        .select()
        .from(OutletUserTable)
        .where(eq(OutletUserTable.userId, userId));
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
      const conditions = [inArray(OutletUserTable.userId, userIds)];
      if (options.status) {
        conditions.push(eq(OutletUserTable.status, options.status));
      }
      const rows = await db
        .select({
          membershipId: OutletUserTable.id,
          userId: OutletUserTable.userId,
          outletId: OutletUserTable.outletId,
          outletName: OutletTable.name,
          outletStatus: OutletTable.status,
          subRole: OutletUserTable.subRole,
          status: OutletUserTable.status,
        })
        .from(OutletUserTable)
        .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
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
        .update(OutletUserTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(OutletUserTable.id, id));
      return true;
    } catch (error) {
      logger.error('[OutletMemberRepository.remove] Error:', error);
      return false;
    }
  }
}
