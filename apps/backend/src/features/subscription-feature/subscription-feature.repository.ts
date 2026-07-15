import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
  SubscriptionFeatureTable,
  SubscriptionFeatureType,
  SubscriptionFeatureInsertType,
} from '@/features/subscription-feature/subscription-feature.model.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { logger } from '@/util/logger.js';

export class SubscriptionFeatureRepositoryClass {
  constructor() {}

  async getSubscriptionFeatureById(id: string): Promise<SubscriptionFeatureType | null> {
    try {
      const rows = await db
        .select()
        .from(SubscriptionFeatureTable)
        .where(eq(SubscriptionFeatureTable.id, id))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error('[SubscriptionFeatureRepository.getSubscriptionFeatureById] Error:', error);
      return null;
    }
  }

  async getAllSubscriptionFeatures(): Promise<SubscriptionFeatureType[]> {
    try {
      return await db.select().from(SubscriptionFeatureTable);
    } catch (error) {
      logger.error('[SubscriptionFeatureRepository.getAllSubscriptionFeatures] Error:', error);
      return [];
    }
  }

  async createSubscriptionFeature(
    subscriptionFeature: Omit<SubscriptionFeatureInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<SubscriptionFeatureType | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[SubscriptionFeatureRepository.createSubscriptionFeature] Creating subscription feature:', subscriptionFeature);
      const [newSubscriptionFeature] = await dbClient
        .insert(SubscriptionFeatureTable)
        .values(subscriptionFeature)
        .returning();
      logger.info('[SubscriptionFeatureRepository.createSubscriptionFeature] Subscription feature successfully created:', newSubscriptionFeature);
      return newSubscriptionFeature ?? null;
    } catch (error) {
      logger.error('[SubscriptionFeatureRepository.createSubscriptionFeature] Error:', error);
      return null;
    }
  }

  async updateSubscriptionFeature(
    id: string,
    subscriptionFeature: Partial<SubscriptionFeatureInsertType>,
    tx?: DbTransaction,
  ): Promise<SubscriptionFeatureType | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[SubscriptionFeatureRepository.updateSubscriptionFeature] Updating subscription feature:', subscriptionFeature);
      const [updatedSubscriptionFeature] = await dbClient
        .update(SubscriptionFeatureTable)
        .set({ ...subscriptionFeature, updatedAt: new Date() })
        .where(eq(SubscriptionFeatureTable.id, id))
        .returning();
      logger.info('[SubscriptionFeatureRepository.updateSubscriptionFeature] Subscription feature successfully updated:', updatedSubscriptionFeature);
      return updatedSubscriptionFeature ?? null;
    } catch (error) {
      logger.error('[SubscriptionFeatureRepository.updateSubscriptionFeature] Error:', error);
      return null;
    }
  }

  async deleteSubscriptionFeature(id: string, tx?: DbTransaction): Promise<SubscriptionFeatureType | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[SubscriptionFeatureRepository.deleteSubscriptionFeature] Deleting subscription feature:', id);
      const [deleted] = await dbClient
        .delete(SubscriptionFeatureTable)
        .where(eq(SubscriptionFeatureTable.id, id))
        .returning();
      return deleted ?? null;
    } catch (error) {
      logger.error('[SubscriptionFeatureRepository.deleteSubscriptionFeature] Error:', error);
      return null;
    }
  }
}
