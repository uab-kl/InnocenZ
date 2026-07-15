import { db } from '@/db/index';
import { eq, inArray, and, SQL, or, ilike, asc, desc, sql } from 'drizzle-orm';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { logger } from '@/util/logger.js';
import { UserInsertType, UserTable, UserType } from '@/features/user/user.model.js';
import { UserRoleTable, UserRoleInsertType, UserRoleType } from '@/features/rbac/user-role/user-role.model.js';
import { RoleInsertType, RoleTable, RoleType } from '@/features/rbac/role/role.model.js';
import { DbTransaction } from '@/types/db-transaction';
import { ModuleTable, ModuleType, ModuleInsertType } from '@/features/rbac/module/module.model.js';
import { PermissionTable, PermissionType, PermissionInsertType } from '@/features/rbac/permission/permission.model.js';
import { RolePermissionTable, RolePermissionInsertType, RolePermissionType } from '@/features/rbac/role-permission/role-permission.model.js';
import { UserRepositoryClass as UserRepository } from '@/features/user/user.repository.js';
import { UserRoleRepositoryClass as UserRoleRepository } from '@/features/rbac/user-role/user-role.repository.js';
import { RolePermissionGroupType } from '@/schema/rbac.schema.js';
import { ResetPasswordTokenTable, ResetPasswordTokenType } from './auth.model.js';
export class AuthRepositoryClass {
  constructor(
    private jwtController: JwtControllerClass,
    private userRepository: UserRepository,
    private userRoleRepository: UserRoleRepository
  ) { }

  async getUserIdsByRoleId(roleId: string): Promise<string[]> {
    return this.userRoleRepository.getUserIdsByRoleId(roleId);
  }

  async getUserDataByToken(token: string): Promise<UserType | null> {
    try {
      const payload = this.jwtController.verifyToken(token);
      return this.userRepository.getUserByLoginMethod(payload.loginMethod, payload.loginCriteria);
    } catch (error) {
      logger.error('[AuthRepository.getUserDataByToken] Error:', error);
      return null;
    }
  }

  async getRolesForUserIds(userIds: string[]): Promise<Array<{ userId: string; roleId: string; roleName: string }>> {
    if (userIds.length === 0) return [];
    try {
      const results = await db
        .select({
          userId: UserRoleTable.userId,
          roleId: RoleTable.id,
          roleName: RoleTable.roleName,
        })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
        .where(and(inArray(UserRoleTable.userId, userIds)));
      return results;
    } catch (error) {
      logger.error('[AuthRepository.getRolesForUserIds] Error:', error);
      return [];
    }
  }

  async createUserWithRole(
    userData: Omit<UserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    roleId: string
  ): Promise<UserType> {
    try {
      logger.info('[AuthRepository.createUserWithRole] Creating user with role...', {
        email: userData.email,
        roleId,
      });
      const newUser = await db.transaction(async (tx) => {
        const user = await this.userRepository.createUser(userData, tx);
        await this.userRoleRepository.assignRoleToUser(
          {
            userId: user.id,
            roleId,
            createdBy: userData.createdBy ?? 'system',
            updatedBy: userData.updatedBy ?? 'system',
          },
          tx
        );
        return user;
      });
      logger.info('[AuthRepository.createUserWithRole] User created with role:', newUser.email);
      return newUser;
    } catch (error) {
      logger.error('[AuthRepository.createUserWithRole] Error:', error);
      throw error;
    }
  }

  async getModulesWithPermissions(): Promise<Array<{
    moduleId: string;
    moduleName: string;
    permissionId: string;
    permissionType: string;
    description: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
  }>> {
    try {
      const results = await db
        .select({
          moduleId: ModuleTable.id,
          moduleName: ModuleTable.moduleName,
          permissionId: PermissionTable.id,
          permissionType: PermissionTable.permissionType,
          description: PermissionTable.description,
          status: ModuleTable.status,
          createdAt: ModuleTable.createdAt,
          updatedAt: ModuleTable.updatedAt,
          createdBy: ModuleTable.createdBy,
          updatedBy: ModuleTable.updatedBy,
        })
        .from(ModuleTable)
        .leftJoin(PermissionTable, eq(ModuleTable.id, PermissionTable.moduleId));

      return results.map(r => ({
        ...r,
        permissionId: r.permissionId ?? '',
        permissionType: r.permissionType || '',
        description: r.description ?? '',
      }));
    } catch (error) {
      logger.error('[AuthRepository.getModulesWithPermissions] Error:', error);
      return [];
    }
  }

  async getUserPermissions(userId: string): Promise<RolePermissionGroupType[]> {
    try {
      logger.info('[AuthRepository.getUserPermissions] Getting user permissions...');
      const results = await db
        .select({
          id: RolePermissionTable.id,
          roleId: RolePermissionTable.roleId,
          permissionId: RolePermissionTable.permissionId,
          permissionType: PermissionTable.permissionType,
          moduleId: PermissionTable.moduleId,
          moduleName: ModuleTable.moduleName,
        })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
        .innerJoin(RolePermissionTable, eq(UserRoleTable.roleId, RolePermissionTable.roleId))
        .innerJoin(PermissionTable, eq(RolePermissionTable.permissionId, PermissionTable.id))
        .innerJoin(ModuleTable, eq(PermissionTable.moduleId, ModuleTable.id))
        .where(
          and(
            eq(UserRoleTable.userId, userId),
            eq(RoleTable.status, 'active'),
            eq(PermissionTable.status, 'active'),
            eq(ModuleTable.status, 'active'),
          ),
        );

      logger.info('[AuthRepository.getUserPermissions] User permissions fetched successfully');
      return results;
    } catch (error) {
      logger.error('[AuthRepository.getUserPermissions] Error:', error);
      return [];
    }
  }

  async createResetPasswordToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    try {
      await db.delete(ResetPasswordTokenTable).where(eq(ResetPasswordTokenTable.userId, userId));
      await db.insert(ResetPasswordTokenTable).values({
        userId,
        token,
        expiresAt,
      });
      logger.info('[AuthRepository.createResetPasswordToken] Reset password token created successfully');
    } catch (error) {
      logger.error('[AuthRepository.createResetPasswordToken] Error:', error);
      throw error;
    }
  }

  async getPasswordResetToken(token: string): Promise<ResetPasswordTokenType | null> {
    const rows = await db
      .select()
      .from(ResetPasswordTokenTable)
      .where(eq(ResetPasswordTokenTable.token, token))
      .limit(1);
    return rows[0] ?? null;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db
      .delete(ResetPasswordTokenTable)
      .where(eq(ResetPasswordTokenTable.token, token));
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(UserTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(UserTable.id, userId));
  }
}
