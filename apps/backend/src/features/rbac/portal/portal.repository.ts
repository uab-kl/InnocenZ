import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { PortalTable, PortalType, PortalInsertType } from './portal.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';

export class PortalRepositoryClass {
  async getPortalById(portalId: string): Promise<PortalType | null> {
    try {
      const [row] = await db.select().from(PortalTable).where(eq(PortalTable.id, portalId)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PortalRepository.getPortalById] Error:', error);
      return null;
    }
  }

  async getPortalByCode(code: string): Promise<PortalType | null> {
    try {
      const [row] = await db.select().from(PortalTable).where(eq(PortalTable.code, code)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PortalRepository.getPortalByCode] Error:', error);
      return null;
    }
  }

  async getAllPortals(): Promise<PortalType[]> {
    try {
      return await db.select().from(PortalTable);
    } catch (error) {
      logger.error('[PortalRepository.getAllPortals] Error:', error);
      return [];
    }
  }

  async createPortal(
    data: Omit<PortalInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<PortalType> {
    const dbClient = tx ?? db;
    const [row] = await dbClient.insert(PortalTable).values(data).returning();
    return row;
  }
}

export const portalRepository = new PortalRepositoryClass();
