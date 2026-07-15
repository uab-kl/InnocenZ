import { eq, ilike, and, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { ModuleTable, ModuleType, ModuleInsertType } from './module.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';

export class ModuleRepositoryClass {
  constructor() {}

  async getModuleById(moduleId: string): Promise<ModuleType | null> {
    try {
      const rows = await db.select().from(ModuleTable).where(eq(ModuleTable.id, moduleId)).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error('[ModuleRepository.getModuleById] Error:', error);
      return null;
    }
  }

  async getAllModules(): Promise<ModuleType[]> {
    try {
      return await db.select().from(ModuleTable);
    } catch (error) {
      logger.error('[ModuleRepository.getAllModules] Error:', error);
      return [];
    }
  }

  async createModule(
    moduleData: Omit<ModuleInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<ModuleType> {
    try {
      const dbClient = tx ?? db;
      logger.info('[ModuleRepository.createModule] Creating module...');
      const [module] = await dbClient.insert(ModuleTable).values(moduleData).returning();
      return module;
    } catch (error) {
      logger.error('[ModuleRepository.createModule] Error:', error);
      throw error;
    }
  }

  async updateModule(
    moduleId: string,
    moduleData: Partial<ModuleInsertType>,
    tx?: DbTransaction,
  ): Promise<ModuleType | null> {
    try {
      const dbClient = tx ?? db;
      logger.info('[ModuleRepository.updateModule] Updating module...');
      const [module] = await dbClient
        .update(ModuleTable)
        .set({ ...moduleData, updatedAt: new Date() })
        .where(eq(ModuleTable.id, moduleId))
        .returning();
      return module ?? null;
    } catch (error) {
      logger.error('[ModuleRepository.updateModule] Error:', error);
      return null;
    }
  }
}
