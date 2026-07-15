import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { Subscription, SubscriptionTable, SubscriptionInsertType } from './subscription.model.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';

export class SubscriptionRepositoryClass {
  constructor() {}

  async getSubscriptionById(id: string): Promise<Subscription | null> {
    try {
      const rows = await db.select().from(SubscriptionTable).where(eq(SubscriptionTable.id, id)).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error('[SubscriptionRepository.getSubscriptionById] Error:', error);
      return null;
    }
  }

  async getAllSubscriptions(): Promise<Subscription[]> {
    try {
      return await db.select().from(SubscriptionTable);
    } catch (error) {
      logger.error('[SubscriptionRepository.getAllSubscriptions] Error:', error);
      return [];
    }
  }

  async createSubscription(
    subscription: Omit<SubscriptionInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<Subscription | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[SubscriptionRepository.createSubscription] Creating subscription:', subscription);
      const [newSubscription] = await dbClient.insert(SubscriptionTable).values(subscription).returning();
      logger.info('[SubscriptionRepository.createSubscription] Subscription successfully created:', newSubscription);
      return newSubscription ?? null;
    } catch (error) {
      logger.error('[SubscriptionRepository.createSubscription] Error:', error);
      return null;
    }
  }

  async updateSubscription(
    id: string,
    subscription: Partial<SubscriptionInsertType>,
    tx?: DbTransaction,
  ): Promise<Subscription | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[SubscriptionRepository.updateSubscription] Updating subscription:', subscription);
      const [updatedSubscription] = await dbClient
        .update(SubscriptionTable)
        .set({ ...subscription, updatedAt: new Date() })
        .where(eq(SubscriptionTable.id, id))
        .returning();
      logger.info('[SubscriptionRepository.updateSubscription] Subscription successfully updated:', updatedSubscription);
      return updatedSubscription ?? null;
    } catch (error) {
      logger.error('[SubscriptionRepository.updateSubscription] Error:', error);
      return null;
    }
  }
}
