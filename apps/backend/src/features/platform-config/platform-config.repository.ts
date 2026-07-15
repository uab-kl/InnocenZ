import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { PlatformConfig, PlatformConfigTable, NewPlatformConfig } from './platform-config.model.js';
import { logger } from '@/util/logger.js';

const SYSTEM_ACTOR = 'system';

export class PlatformConfigRepositoryClass {
  constructor() {}

  // Returns the singleton config row, creating it with defaults on first access.
  async getConfig(): Promise<PlatformConfig | null> {
    try {
      const rows = await db.select().from(PlatformConfigTable).limit(1);
      if (rows[0]) return rows[0];
      const [created] = await db
        .insert(PlatformConfigTable)
        .values({ createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR })
        .returning();
      return created ?? null;
    } catch (error) {
      logger.error('[PlatformConfigRepository.getConfig] Error:', error);
      return null;
    }
  }

  async updateConfig(data: Partial<NewPlatformConfig>): Promise<PlatformConfig | null> {
    try {
      const current = await this.getConfig();
      if (!current) return null;
      const [updated] = await db
        .update(PlatformConfigTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PlatformConfigTable.id, current.id))
        .returning();
      return updated ?? null;
    } catch (error) {
      logger.error('[PlatformConfigRepository.updateConfig] Error:', error);
      return null;
    }
  }
}
