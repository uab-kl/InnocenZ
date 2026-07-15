import { and, eq, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import {
  CommissionConfigTable,
  CommissionConfigInsertType,
  CommissionConfigType,
  CommissionConfigFilter,
} from './commission-config.model';

export class CommissionConfigRepositoryClass {
  async upsert(
    data: Omit<CommissionConfigInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<CommissionConfigType> {
    try {
      const dbClient = tx ?? db;
      const existing = await this.getByOutletAgencyItem(data.outletId, data.agencyId, data.itemType);
      if (existing) {
        const [updated] = await dbClient
          .update(CommissionConfigTable)
          .set({ unitPrice: data.unitPrice, commissionRate: data.commissionRate, status: data.status, updatedBy: data.updatedBy, updatedAt: new Date() })
          .where(eq(CommissionConfigTable.id, existing.id))
          .returning();
        return updated;
      }
      const [config] = await dbClient.insert(CommissionConfigTable).values(data).returning();
      logger.info('[CommissionConfigRepository.upsert] Config created:', config.id);
      return config;
    } catch (error) {
      logger.error('[CommissionConfigRepository.upsert] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<CommissionConfigInsertType>,
    tx?: DbTransaction,
  ): Promise<CommissionConfigType | null> {
    try {
      const dbClient = tx ?? db;
      const [config] = await dbClient
        .update(CommissionConfigTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(CommissionConfigTable.id, id))
        .returning();
      return config ?? null;
    } catch (error) {
      logger.error('[CommissionConfigRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<CommissionConfigType | null> {
    try {
      const [config] = await db
        .select()
        .from(CommissionConfigTable)
        .where(eq(CommissionConfigTable.id, id))
        .limit(1);
      return config ?? null;
    } catch (error) {
      logger.error('[CommissionConfigRepository.getById] Error:', error);
      return null;
    }
  }

  async getByOutletAgencyItem(outletId: string, agencyId: string, itemType: string): Promise<CommissionConfigType | null> {
    try {
      const [config] = await db
        .select()
        .from(CommissionConfigTable)
        .where(
          and(
            eq(CommissionConfigTable.outletId, outletId),
            eq(CommissionConfigTable.agencyId, agencyId),
            eq(CommissionConfigTable.itemType, itemType),
          ),
        )
        .limit(1);
      return config ?? null;
    } catch (error) {
      logger.error('[CommissionConfigRepository.getByOutletAgencyItem] Error:', error);
      return null;
    }
  }

  async list(filter: CommissionConfigFilter = {}): Promise<CommissionConfigType[]> {
    try {
      const conditions: SQL[] = [];
      if (filter.outletId) conditions.push(eq(CommissionConfigTable.outletId, filter.outletId));
      if (filter.agencyId) conditions.push(eq(CommissionConfigTable.agencyId, filter.agencyId));
      if (filter.itemType) conditions.push(eq(CommissionConfigTable.itemType, filter.itemType));
      if (filter.status) conditions.push(eq(CommissionConfigTable.status, filter.status));

      return db
        .select()
        .from(CommissionConfigTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(CommissionConfigTable.itemType);
    } catch (error) {
      logger.error('[CommissionConfigRepository.list] Error:', error);
      return [];
    }
  }

  async delete(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(CommissionConfigTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(CommissionConfigTable.id, id));
      return true;
    } catch (error) {
      logger.error('[CommissionConfigRepository.delete] Error:', error);
      return false;
    }
  }
}
