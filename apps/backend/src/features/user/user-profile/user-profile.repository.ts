import { and, eq, inArray, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger';
import {
  UserProfileFilter,
  UserProfileInsertType,
  UserProfileTable,
  UserProfileType,
  VerificationStatus,
} from './user-profile.model';

export class UserProfileRepositoryClass {
  constructor() {}

  async getById(id: string): Promise<UserProfileType | null> {
    try {
      const [profile] = await db
        .select()
        .from(UserProfileTable)
        .where(eq(UserProfileTable.id, id))
        .limit(1);
      return profile ?? null;
    } catch (error) {
      logger.error('[UserProfileRepository.getById] Error:', error);
      return null;
    }
  }

  async getByUserId(userId: string): Promise<UserProfileType | null> {
    try {
      const [profile] = await db
        .select()
        .from(UserProfileTable)
        .where(eq(UserProfileTable.userId, userId))
        .limit(1);
      return profile ?? null;
    } catch (error) {
      logger.error('[UserProfileRepository.getByUserId] Error:', error);
      return null;
    }
  }

  async list(filter: UserProfileFilter = {}): Promise<UserProfileType[]> {
    try {
      const where: SQL[] = [];

      if (filter.userId) where.push(eq(UserProfileTable.userId, filter.userId));
      if (filter.nationality) where.push(eq(UserProfileTable.nationality, filter.nationality));
      if (filter.verificationStatus) {
        where.push(eq(UserProfileTable.verificationStatus, filter.verificationStatus));
      }
      if (filter.underAgency !== undefined) {
        where.push(eq(UserProfileTable.underAgency, filter.underAgency));
      }
      if (filter.agencyId) where.push(eq(UserProfileTable.agencyId, filter.agencyId));

      return db
        .select()
        .from(UserProfileTable)
        .where(where.length > 0 ? and(...where) : undefined);
    } catch (error) {
      logger.error('[UserProfileRepository.list] Error:', error);
      return [];
    }
  }

  async getByUserIds(userIds: string[]): Promise<UserProfileType[]> {
    if (userIds.length === 0) return [];
    try {
      return db
        .select()
        .from(UserProfileTable)
        .where(inArray(UserProfileTable.userId, userIds));
    } catch (error) {
      logger.error('[UserProfileRepository.getByUserIds] Error:', error);
      return [];
    }
  }

  async createEmpty(userId: string, actor?: string, tx?: DbTransaction): Promise<UserProfileType> {
    try {
      const dbClient = tx ?? db;
      const [profile] = await dbClient
        .insert(UserProfileTable)
        .values({
          userId,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
      return profile;
    } catch (error) {
      logger.error('[UserProfileRepository.createEmpty] Error:', error);
      throw error;
    }
  }

  async create(
    data: Omit<UserProfileInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<UserProfileType> {
    try {
      const dbClient = tx ?? db;
      const [profile] = await dbClient
        .insert(UserProfileTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return profile;
    } catch (error) {
      logger.error('[UserProfileRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    userId: string,
    data: Partial<UserProfileInsertType>,
    tx?: DbTransaction,
  ): Promise<UserProfileType | null> {
    try {
      const dbClient = tx ?? db;
      const [profile] = await dbClient
        .update(UserProfileTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(UserProfileTable.userId, userId))
        .returning();
      return profile ?? null;
    } catch (error) {
      logger.error('[UserProfileRepository.update] Error:', error);
      return null;
    }
  }

  async updateVerificationStatus(
    userId: string,
    status: VerificationStatus,
    tx?: DbTransaction,
  ): Promise<UserProfileType | null> {
    return this.update(
      userId,
      {
        verificationStatus: status,
        verifiedAt: status === 'verified' ? new Date() : null,
      },
      tx,
    );
  }
}
