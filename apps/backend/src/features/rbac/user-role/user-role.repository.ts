import { db } from '@/db/index';
import { UserRoleTable, UserRoleInsertType, UserRoleType } from './user-role.model';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { RoleType, RoleTable } from '../role/role.model';
import { eq, inArray, and } from 'drizzle-orm';

export class UserRoleRepositoryClass {
  constructor() { }

  async getUserIdsByRoleId(roleId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ userId: UserRoleTable.userId })
        .from(UserRoleTable)
        .where(eq(UserRoleTable.roleId, roleId));
      return rows.map((r) => r.userId);
    } catch (error) {
      logger.error('[UserRoleRepository.getUserIdsByRoleId] Error:', error);
      return [];
    }
  }

  async getUserRoles(userId: string | string[]): Promise<Array<RoleType>> {
    try{
      const results = await db
        .select({
          id: RoleTable.id,
          roleName: RoleTable.roleName,
          portalId: RoleTable.portalId,
          status: RoleTable.status,
          createdAt: RoleTable.createdAt,
          updatedAt: RoleTable.updatedAt,
          createdBy: RoleTable.createdBy,
          updatedBy: RoleTable.updatedBy,
        })
      .from(UserRoleTable)
      .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
      .where(and(
        Array.isArray(userId) ? inArray(UserRoleTable.userId, userId as string[]) : eq(UserRoleTable.userId, userId as string),
      ));
      return results;
    }catch (error) {
      logger.error('[UserRoleRepository.getUserRoles] Error:', error);
      return [];
    }
  }

  /**
   * Take a role back.
   *
   * The missing half of `assignRoleToUser`: until this existed, a granted role
   * could never be revoked, so an account promoted to admin stayed admin
   * permanently — and with no way to delete or disable the account either, that
   * made "anyone who can create an account can mint a permanent admin" literally
   * true. Returns false when the pairing was not there, so a caller can answer
   * 404 rather than report a revocation that revoked nothing.
   */
  async revokeRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const rows = await db
        .delete(UserRoleTable)
        .where(and(eq(UserRoleTable.userId, userId), eq(UserRoleTable.roleId, roleId)))
        .returning({ id: UserRoleTable.id });
      return rows.length > 0;
    } catch (error) {
      logger.error('[UserRoleRepository.revokeRole] Error:', error);
      throw error;
    }
  }

  /**
   * How many accounts hold this role — the last-admin guard.
   *
   * Fails CLOSED by returning 0 on error, which makes the caller treat the role
   * as about to be emptied and refuse. Refusing a legitimate revocation is an
   * inconvenience; letting the final admin be removed locks everybody out of the
   * platform with no endpoint left to fix it.
   */
  async countUsersWithRole(roleId: string): Promise<number> {
    try {
      const rows = await db
        .select({ userId: UserRoleTable.userId })
        .from(UserRoleTable)
        .where(eq(UserRoleTable.roleId, roleId));
      return new Set(rows.map((r) => r.userId)).size;
    } catch (error) {
      logger.error('[UserRoleRepository.countUsersWithRole] Error:', error);
      return 0;
    }
  }

  async assignRoleToUser(
    data: Omit<UserRoleInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<UserRoleType> {
    try {
      const dbClient = tx || db;

      logger.info('[UserRoleRepository.assignRoleToUser] Assigning role to user...');

      const [userRole] = await dbClient
        .insert(UserRoleTable)
        .values(data)
        .returning();

      logger.info('[UserRoleRepository.assignRoleToUser] Role assigned successfully');
      return userRole;
    } catch (error) {
      logger.error('[UserRoleRepository.assignRoleToUser] Error:', error);
      throw error;
    }
  }

  async removeRoleFromUser(userId: string, roleId: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      logger.info('[AuthRepository.removeRoleFromUser] Removing role from user...');

      await dbClient
        .delete(UserRoleTable)
        .where(and(eq(UserRoleTable.userId, userId), eq(UserRoleTable.roleId, roleId)));

      logger.info('[AuthRepository.removeRoleFromUser] Role removed successfully');
      return true;
    } catch (error) {
      logger.error('[AuthRepository.removeRoleFromUser] Error:', error);
      return false;
    }
  }
}