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
          moduleKey: ModuleTable.moduleKey,
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

  /**
   * Replace a role's whole permission set.
   *
   * ⚠️ THIS DELETES FIRST, so its failure mode is not "nothing happened" — it
   * is "the role now has NOTHING". Two things used to make that silent:
   *
   *   · the delete and the insert ran unwrapped, so an insert that threw left
   *     the delete committed; and
   *   · the catch returned `[]`, which the controller could not tell from a
   *     legitimately empty set — so it answered 200 "Role permissions synced"
   *     over a role that had just been stripped of every grant.
   *
   * `role_permission` is the RBAC authority for this entire product (owner,
   * 11 Sep 2026: "the rbac must ensure what can do what cannot do, ofcourse
   * must from the database"). A write to it that fails quietly and reports
   * success is the worst shape available.
   *
   * Now both statements run in ONE transaction and errors PROPAGATE; the
   * controller's own catch turns that into the 500 it always should have been.
   */
  async updateRolePermission(
    roleId: string,
    permissionIds: string[],
    createdBy: string,
    updatedBy: string,
    tx?: DbTransaction
  ): Promise<RolePermissionType[]> {
    logger.info('[RolePermissionRepository.updateRolePermission] Updating role permissions...');

    const run = async (dbClient: typeof db | DbTransaction) => {
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
    };

    // An outer transaction wins — a caller that already opened one is
    // sequencing this against other writes and must keep that atomicity.
    return tx ? run(tx) : db.transaction((t) => run(t as DbTransaction));
  }

  
}