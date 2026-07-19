import { and, desc, eq, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  Rating,
  RatingFilter,
  RatingInsertType,
  RatingTable,
} from './rating.model.js';

export class RatingRepositoryClass {
  private buildConditions(filter?: RatingFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.outletId) conditions.push(eq(RatingTable.outletId, filter.outletId));
    if (filter?.prId) conditions.push(eq(RatingTable.prId, filter.prId));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async list(filter?: RatingFilter): Promise<Rating[]> {
    try {
      return await db
        .select()
        .from(RatingTable)
        .where(this.buildConditions(filter))
        .orderBy(desc(RatingTable.updatedAt));
    } catch (error) {
      logger.error('[RatingRepository.list] Error:', error);
      return [];
    }
  }

  // Create-or-update the outlet's current rating for a PR (unique on outlet + PR).
  async upsert(
    data: Omit<RatingInsertType, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
    actor: string,
  ): Promise<Rating | null> {
    try {
      const [row] = await db
        .insert(RatingTable)
        .values({ ...data, createdBy: actor, updatedBy: actor })
        .onConflictDoUpdate({
          target: [RatingTable.outletId, RatingTable.prId],
          set: {
            prName: data.prName,
            stars: data.stars,
            note: data.note,
            tags: data.tags,
            updatedBy: actor,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[RatingRepository.upsert] Error:', error);
      return null;
    }
  }
}
