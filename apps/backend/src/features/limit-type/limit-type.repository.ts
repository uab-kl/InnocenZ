import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { LimitType, LimitTypeTable, NewLimitType } from './limit-type.model.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';

export class LimitTypeRepositoryClass {
  constructor() {}

  async getLimitTypeById(id: string): Promise<LimitType | null> {
    try {
      const rows = await db.select().from(LimitTypeTable).where(eq(LimitTypeTable.id, id)).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error('[LimitTypeRepository.getLimitTypeById] Error:', error);
      return null;
    }
  }

  async getAllLimitTypes(): Promise<LimitType[]> {
    try {
      return await db.select().from(LimitTypeTable);
    } catch (error) {
      logger.error('[LimitTypeRepository.getAllLimitTypes] Error:', error);
      return [];
    }
  }

  async createLimitType(
    data: Omit<NewLimitType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<LimitType | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[LimitTypeRepository.createLimitType] Creating limit type...');
      const [limitType] = await dbClient.insert(LimitTypeTable).values(data).returning();
      return limitType ?? null;
    } catch (error) {
      logger.error('[LimitTypeRepository.createLimitType] Error:', error);
      return null;
    }
  }

  async updateLimitType(
    id: string,
    data: Partial<NewLimitType>,
    tx?: DbTransaction,
  ): Promise<LimitType | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[LimitTypeRepository.updateLimitType] Updating limit type...');
      const [limitType] = await dbClient
        .update(LimitTypeTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(LimitTypeTable.id, id))
        .returning();
      return limitType ?? null;
    } catch (error) {
      logger.error('[LimitTypeRepository.updateLimitType] Error:', error);
      return null;
    }
  }
}
