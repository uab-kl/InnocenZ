import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { OutletMemberTable, OutletMemberInsertType, OutletMemberType } from './outlet.model';

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
