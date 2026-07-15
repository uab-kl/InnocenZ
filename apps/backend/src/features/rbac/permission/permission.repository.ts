import { eq, and, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { PermissionTable, PermissionType, PermissionInsertType } from './permission.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
export class PermissionRepositoryClass {
  constructor() {}

  async getPermissionById(permissionId: string): Promise<PermissionType | null> {
    try{
      const permission = await db.select().from(PermissionTable).where(eq(PermissionTable.id, permissionId)).limit(1);
      return permission.length > 0 ? permission[0] : null;
    }catch (error) {
      logger.error('[PermissionRepository.getPermissionById] Error:', error);
      return null;
    }
  }

  async createPermission(permissionData: Omit<PermissionInsertType, 'id' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<PermissionType> {
    try{
      const dbClient = tx || db;
      logger.info('[PermissionRepository.createPermission] Creating permission...');
      const [permission] = await dbClient
        .insert(PermissionTable)
        .values(permissionData)
        .returning();
      return permission;
    }catch (error) {
      logger.error('[PermissionRepository.createPermission] Error:', error);
      throw error;
    }
  }

  async updatePermission(
    permissionId: string,
    permissionData: Partial<PermissionInsertType>,
    tx?: DbTransaction
  ): Promise<PermissionType | null> {
    try {
      const dbClient = tx || db;
      
      logger.info('[PermissionRepository.updatePermission] Updating permission...');
      
      const [permission] = await dbClient
        .update(PermissionTable)
        .set({ ...permissionData, updatedAt: new Date() })
        .where(eq(PermissionTable.id, permissionId))
        .returning();
      
      logger.info('[PermissionRepository.updatePermission] Permission updated successfully');
      return permission || null;
    } catch (error) {
      logger.error('[PermissionRepository.updatePermission] Error:', error);
      return null;
    }
  }

  async getAllPermissions(): Promise<PermissionType[]> {
    try {
      return await db.select().from(PermissionTable);
    } catch (error) {
      logger.error('[PermissionRepository.getAllPermissions] Error:', error);
      return [];
    }
  }
}
