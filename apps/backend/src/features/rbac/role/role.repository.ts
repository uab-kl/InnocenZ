import { eq, ilike, and, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable, RoleType, RoleInsertType, RoleFilter } from './role.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
export class RoleRepositoryClass {
  constructor() { }

  async getRoleById(roleId: string): Promise<RoleType | null> {
    try {
      const role = await db.select().from(RoleTable).where(eq(RoleTable.id, roleId)).limit(1);
      return role.length > 0 ? role[0] : null;
    } catch (error) {
      logger.error('[RoleRepository.getRoleById] Error:', error);
      return null;
    }
  }

  async getRoleByName(roleName: string): Promise<RoleType | null> {
    try {
      const role = await db.select().from(RoleTable).where(eq(RoleTable.roleName, roleName)).limit(1);
      return role.length > 0 ? role[0] : null;
    } catch (error) {
      logger.error('[RoleRepository.getRoleByName] Error:', error);
      return null;
    }
  }

  async getAllRoles(): Promise<RoleType[]> {
    try {
      const roles = await db.select().from(RoleTable);
      return roles;
    } catch (error) {
      logger.error('[RoleRepository.getAllRoles] Error:', error);
      return [];
    }
  }

  async createRole(roleData: Omit<RoleInsertType, 'id' | 'createdAt' | 'updatedAt'>, tx?: DbTransaction): Promise<RoleType> {
    try {
      const dbClient = tx || db;
      logger.info('[RoleRepository.createRole] Creating role...');
      const [role] = await dbClient
        .insert(RoleTable)
        .values(roleData)
        .returning();
      return role;
    } catch (error) {
      logger.error('[RoleRepository.createRole] Error:', error);
      throw error;
    }
  }

  async updateRole(roleId: string, roleData: Partial<RoleInsertType>, tx?: DbTransaction): Promise<RoleType | null> {
    try {
      const dbClient = tx || db;

      logger.info('[RoleRepository.updateRole] Updating role...');

      const [role] = await dbClient
        .update(RoleTable)
        .set({ ...roleData, updatedAt: new Date() })
        .where(eq(RoleTable.id, roleId))
        .returning();

      logger.info('[RoleRepository.updateRole] Role updated successfully');
      return role || null;
    } catch (error) {
      logger.error('[RoleRepository.updateRole] Error:', error);
      return null;
    }
  }

}
