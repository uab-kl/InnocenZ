import { db } from '@/db/index';
import { eq, inArray, and, SQL, or, ilike, asc, desc, sql } from 'drizzle-orm';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { logger } from '@/util/logger.js';
import { UserInsertType, UserTable, UserType } from '@/features/user/user.model.js';
import { UserRoleTable, UserRoleInsertType, UserRoleType } from '@/features/rbac/user-role/user-role.model.js';
import { RoleInsertType, RoleTable, RoleType } from '@/features/rbac/role/role.model.js';
import { PortalTable } from '@/features/rbac/portal/portal.model.js';
import { DbTransaction } from '@/types/db-transaction';
import { ModuleTable, ModuleType, ModuleInsertType } from '@/features/rbac/module/module.model.js';
import { PermissionTable, PermissionType, PermissionInsertType } from '@/features/rbac/permission/permission.model.js';
import { RolePermissionTable, RolePermissionInsertType, RolePermissionType } from '@/features/rbac/role-permission/role-permission.model.js';
import { UserRepositoryClass as UserRepository } from '@/features/user/user.repository.js';
import { UserRoleRepositoryClass as UserRoleRepository } from '@/features/rbac/user-role/user-role.repository.js';
import { RolePermissionGroupType } from '@/schema/rbac.schema.js';
import { ResetPasswordTokenTable, ResetPasswordTokenType } from './auth.model.js';
import { AgencyUserTable } from '@/features/agency/agency.model.js';
import { OutletUserTable } from '@/features/outlet/outlet.model.js';
import { portalRoleName } from '@/types/rbac-constant.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
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

  async getRolesForUserIds(
    userIds: string[],
  ): Promise<Array<{ userId: string; roleId: string; roleName: string; portalId: string | null; portalCode: string | null }>> {
    if (userIds.length === 0) return [];
    try {
      const results = await db
        .select({
          userId: UserRoleTable.userId,
          roleId: RoleTable.id,
          roleName: RoleTable.roleName,
          portalId: RoleTable.portalId,
          portalCode: PortalTable.code,
        })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
        .leftJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
        .where(
          and(
            inArray(UserRoleTable.userId, userIds),
            /**
             * A DEACTIVATED ROLE GRANTS NOTHING — INCLUDING ROUTE ACCESS.
             *
             * The admin sheet's Active toggle promises exactly that in its own
             * caption ("Inactive roles grant no access"), and half the backend
             * kept the promise: `getUserPermissions` and `userHasPermission`
             * both filter this column, so the module create/read/update paths
             * went dark when a role was switched off. THIS function — the one
             * `requireRole`, `requirePortal`, `requirePermission`, the sub-role
             * guards, `org-scope` and `redact-identity-docs` all actually call
             * — filtered on the user id alone, so a deactivated role sailed
             * through every guarded route as if the toggle did not exist.
             *
             * Fixed here rather than in the eighteen callers for the obvious
             * reason: eighteen copies of a rule is eighteen chances to miss one,
             * which is the mistake this filter repairs.
             *
             * ⚠️ This is the status of the ROLE DEFINITION, not of the grant —
             * `user_role` has no status column, and revoking a role DELETES the
             * row. Measured before shipping, because a wrong guess here locks
             * every admin out: 11 roles, all `active`, and ZERO `user_role`
             * rows pointing at a non-active role. Nobody loses access today;
             * the toggle simply starts meaning what it already claims.
             */
            eq(RoleTable.status, 'active'),
          ),
        );
      return results;
    } catch (error) {
      // Rethrow, never return []: every caller (requireRole, the sub-role
      // guards' isAdmin, controller scope resolvers) catches and answers 500.
      // Swallowing to an empty list here made a transient DB hiccup read as
      // "this user holds no roles" — a false Forbidden for a real admin or
      // agency owner mid-click.
      logger.error('[AuthRepository.getRolesForUserIds] Error:', error);
      throw error;
    }
  }

  /**
   * Backfill: an active membership with NO role row for that portal gets the
   * VIEW-ONLY lane (Director), so the account can sign in and see its
   * organisation.
   *
   * It used to grant OWNER. Nothing needs that — a public sign-up is given its
   * role explicitly by signup-roles.ts — and it meant REVOKING a role silently
   * promoted the account: strip a Director, and their very next /auth/me handed
   * them the owner console. A heal must never be an escalation.
   * Lane is never read from agency_user / outlet_user (column dropped).
   */
  async ensurePortalRolesFromMembership(userId: string): Promise<void> {
    try {
      const [agencyMem] = await db
        .select({ id: AgencyUserTable.id })
        .from(AgencyUserTable)
        .where(
          and(eq(AgencyUserTable.userId, userId), eq(AgencyUserTable.status, 'active')),
        )
        .limit(1);
      const [outletMem] = await db
        .select({ id: OutletUserTable.id })
        .from(OutletUserTable)
        .where(
          and(eq(OutletUserTable.userId, userId), eq(OutletUserTable.status, 'active')),
        )
        .limit(1);

      if (!agencyMem && !outletMem) return;

      const existing = await this.getRolesForUserIds([userId]);
      const havePortal = new Set(
        existing.map((r) => r.portalCode).filter((c): c is string => Boolean(c)),
      );

      const grants: Array<{ roleName: string; portal: 'agency' | 'outlet' }> = [];
      if (agencyMem && !havePortal.has('agency')) {
        grants.push({
          roleName: portalRoleName.DIRECTOR,
          portal: 'agency',
        });
      }
      if (outletMem && !havePortal.has('outlet')) {
        grants.push({
          roleName: portalRoleName.DIRECTOR,
          portal: 'outlet',
        });
      }

      for (const g of grants) {
        const [portal] = await db
          .select({ id: PortalTable.id })
          .from(PortalTable)
          .where(eq(PortalTable.code, g.portal))
          .limit(1);
        if (!portal) continue;
        const [role] = await db
          .select({ id: RoleTable.id })
          .from(RoleTable)
          .where(
            and(
              sql`lower(${RoleTable.roleName}) = ${g.roleName.toLowerCase()}`,
              eq(RoleTable.portalId, portal.id),
            ),
          )
          .limit(1);
        if (!role) continue;
        await this.userRoleRepository.assignRoleToUser({
          userId,
          roleId: role.id,
          createdBy: SYSTEM_ACTOR,
          updatedBy: SYSTEM_ACTOR,
        });
        logger.info(
          `[AuthRepository.ensurePortalRolesFromMembership] Granted ${g.roleName}@${g.portal} to ${userId}`,
        );
      }
    } catch (error) {
      logger.error('[AuthRepository.ensurePortalRolesFromMembership] Error:', error);
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
          moduleKey: ModuleTable.moduleKey,
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

  /**
   * True if the user holds create|read|update on the given module_key, WITHIN
   * the portal that module belongs to.
   *
   * The portal test is the point. Module keys are not unique across portals —
   * `settings`, `dashboard` and `history` exist on both — so matching on key
   * and type alone let a grant from one console satisfy a guard on the other:
   * an agency `settings:update` answered an outlet `settings:update` check.
   *
   * A role is only ever granted permissions on modules of its own portal (see
   * seed-rbac), so requiring role.portal = module.portal costs a correctly
   * seeded account nothing and closes the cross-portal hole.
   */
  async userHasPermission(
    userId: string,
    moduleKey: string,
    permissionType: 'create' | 'read' | 'update',
  ): Promise<boolean> {
    try {
      const [row] = await db
        .select({ id: RolePermissionTable.id })
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
            eq(ModuleTable.moduleKey, moduleKey),
            eq(PermissionTable.permissionType, permissionType),
            /*
             * The role carrying the grant must belong to the module portal —
             * with two deliberate exceptions, both verified against the live
             * grant table (16 of 182 rows are cross-portal and every one of
             * them is one of these):
             *
             *  - ADMIN spans portals by design: the admin role holds booking
             *    and rating on outlet modules, roster and payment_voucher on
             *    agency ones.
             *  - The mobile PR role has NO portal at all and reads dashboard,
             *    rating, roster and payment_voucher across all three.
             *
             * A plain equality here would have locked out every admin and
             * every PR. What it must block is an AGENCY grant answering an
             * OUTLET guard on a module key the two portals share (settings,
             * dashboard, history) — and it still does.
             */
            sql`(${RoleTable.portalId} = ${ModuleTable.portalId}
                 or ${RoleTable.portalId} is null
                 or exists (select 1 from "main"."portal" ap
                             where ap.id = ${RoleTable.portalId} and ap.code = 'admin'))`,
          ),
        )
        .limit(1);
      return Boolean(row);
    } catch (error) {
      // Never soften to true: an unreadable grant table is not permission.
      logger.error('[AuthRepository.userHasPermission] Error:', error);
      return false;
    }
  }

  /** True if any of the user's roles belong to the given portal code. */
  async userHasPortal(userId: string, portalCode: string): Promise<boolean> {
    const roles = await this.getRolesForUserIds([userId]);
    return roles.some((r) => r.portalCode === portalCode);
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
