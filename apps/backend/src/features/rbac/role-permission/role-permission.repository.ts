import { eq, and } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { ModuleTable } from '@/features/rbac/module/module.model';
import { PermissionTable } from '@/features/rbac/permission/permission.model';
import {
  RolePermissionTable,
  RolePermissionType,
  RolePermissionInsertType,
} from './role-permission.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { RolePermissionGroupType } from '@/schema/rbac.schema';
export class RolePermissionRepositoryClass {
  constructor() { }

  async getRolePermissions(roleId: string): Promise<RolePermissionGroupType[]> {
    try {
      const results = await db
        .select({
          id: RolePermissionTable.id,
          roleId: RolePermissionTable.roleId,
          permissionId: RolePermissionTable.permissionId,
          permissionType: PermissionTable.permissionType,
          moduleId: PermissionTable.moduleId,
          moduleName: ModuleTable.moduleName,
        })
        .from(RolePermissionTable)
        .innerJoin(PermissionTable, eq(RolePermissionTable.permissionId, PermissionTable.id))
        .innerJoin(ModuleTable, eq(PermissionTable.moduleId, ModuleTable.id))
        .where(eq(RolePermissionTable.roleId, roleId));
      logger.info('[RolePermissionRepository.getRolePermissions] Role permissions fetched successfully');
      return results;
    } catch (error) {
      logger.error('[RolePermissionRepository.getRolePermissions] Error:', error);
      return [];
    }
  }

  async assignPermissionsToRole(
    data: Omit<RolePermissionInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<RolePermissionType> {
    try {
      const dbClient = tx || db;
      logger.info('[RolePermissionRepository.assignPermissionsToRole] Assigning permissions to role...');
      const [rolePermission] = await dbClient
        .insert(RolePermissionTable)
        .values(data)
        .returning();
      logger.info('[RolePermissionRepository.assignPermissionsToRole] Permissions assigned successfully');
      return rolePermission;
    } catch (error) {
      logger.error('[RolePermissionRepository.assignPermissionsToRole] Error:', error);
      throw error;
    }
  }

  async removeAllPermissionsFromRole(roleId: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('[RolePermissionRepository.removeAllPermissionsFromRole] Removing all permissions from role...');
      await dbClient
        .delete(RolePermissionTable)
        .where(eq(RolePermissionTable.roleId, roleId));
      logger.info('[RolePermissionRepository.removeAllPermissionsFromRole] All permissions removed successfully');
      return true;
    } catch (error) {
      logger.error('[RolePermissionRepository.removeAllPermissionsFromRole] Error:', error);
      return false;
    }
  }

  async updateRolePermission(
    roleId: string,
    permissionIds: string[],
    createdBy: string,
    updatedBy: string,
    tx?: DbTransaction
  ): Promise<RolePermissionType[]> {
    try {
      const dbClient = tx || db;
      logger.info('[RolePermissionRepository.updateRolePermission] Updating role permissions...');

      // Delete existing permissions
      await dbClient
        .delete(RolePermissionTable)
        .where(eq(RolePermissionTable.roleId, roleId));

      // Insert new permissions
      if (permissionIds.length > 0) {
        const newPermissions = await dbClient
          .insert(RolePermissionTable)
          .values(permissionIds.map(permissionId => ({
            roleId,
            permissionId,
            createdBy,
            updatedBy,
          })))
          .returning();

        logger.info('[RolePermissionRepository.updateRolePermission] Role permissions updated successfully');
        return newPermissions;
      }

      return [];

    } catch (error) {
      logger.error('[RolePermissionRepository.updateRolePermission] Error:', error);
      return [];
    }
  }

  
}