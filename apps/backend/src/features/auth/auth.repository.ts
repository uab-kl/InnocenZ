import { db } from '@/db/index';
import { ensurePersonCode } from '@/util/member-code';
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

  /**
   * The same read, plus WHEN THIS TOKEN WAS ISSUED.
   *
   * `getUserDataByToken` throws the payload away, so a caller has no way to ask
   * whether the token predates a password change — which is the only question
   * `user.sessions_valid_from` exists to answer. Kept as a sibling rather than a
   * change of shape: four other callers (audit trail, graphql context, the
   * optional guard, the audit-log wrapper) want the user alone.
   *
   * `issuedAt` is null for a token minted before `iat` was recorded, and a null
   * must be read as "cannot tell" — never as "old".
   */
  async getSessionByToken(
    token: string,
  ): Promise<{ user: UserType; issuedAt: Date | null; isRefresh: boolean } | null> {
    try {
      const payload = this.jwtController.verifyToken(token);
      const user = await this.userRepository.getUserByLoginMethod(
        payload.loginMethod,
        payload.loginCriteria,
      );
      if (!user) return null;
      return {
        user,
        issuedAt: typeof payload.iat === 'number' ? new Date(payload.iat * 1000) : null,
        // A refresh token opens `/auth/refresh` and nothing else. Untyped means
        // access — see the note on `TokenPayload.type`.
        isRefresh: payload.type === 'refresh',
      };
    } catch (error) {
      logger.error('[AuthRepository.getSessionByToken] Error:', error);
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
   * `ensurePortalRolesFromMembership` WAS HERE, AND IS DELETED (owner, 10 Sep 2026:
   * *"the other organisations team members is not allowed to be created
   * automatically ... unless the organisation send Invite link"*).
   *
   * It granted a Director role on EVERY `/auth/me` to anyone holding an active
   * membership with no role for that portal — no invite, no owner decision,
   * `created_by: 'system'`.
   *
   * ⚠️ ITS OWN DOC CLAIMED "a heal must never be an escalation", and since 0160
   * that claim was false. `holdsAgencyLane` (middlewares/require-sub-role.ts)
   * uses the role only as a DOOR check — does this account may open the agency
   * portal — and then reads the AUTHORITY straight off `agency_user.sub_role`.
   * Because removal deliberately leaves `sub_role` intact so the row can still
   * say what somebody WAS, healing a removed OWNER handed back OWNER
   * authority. The grant was written when the lane lived on `user_role`, and
   * 0160 moved the lane without anyone revisiting this.
   *
   * ⚠️ IT WAS NOT DEAD CODE — it was load-bearing for exactly ONE case, and
   * that case is now fixed at the source rather than healed after the fact:
   * reinstating a member with the lane they already held
   * (`{status:'active', subRole:'finance'}` where the column already says
   * `finance`) used to skip the grant block in `updateMember` and leave the
   * account active with no role. That gate now tests only that a title was
   * NAMED. Fix the reinstatement, and there is nothing left to heal.
   *
   * A role is now created in exactly three places: organisation sign-up (the
   * owner, and only the owner), invite acceptance, and an admin acting
   * deliberately through `/rbac/user-role`.
   */

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
      // AFTER the transaction: the id depends on the role that was just granted,
      // and a PR or admin without one is an account nobody can quote.
      await ensurePersonCode(newUser.id);
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
          /*
           * The console this grant belongs to. This query is the UNION of every
           * role the account holds and is deliberately NOT filtered by portal —
           * one call has to answer for all of them. But `settings`, `dashboard`
           * and `history` exist as a separate module row on EACH portal, so the
           * key alone cannot say which console a grant came from, and the web
           * `canModule()` matches on key + verb. Carrying the portal is what
           * makes the union safe to hand out; filtering rows away here instead
           * would break the callers that legitimately read across portals.
           *
           * LEFT join: `m_module.portal_id` is nullable, and a module with no
           * portal must keep behaving exactly as it does today rather than
           * dropping out of the answer.
           */
          portalCode: PortalTable.code,
        })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(UserRoleTable.roleId, RoleTable.id))
        .innerJoin(RolePermissionTable, eq(UserRoleTable.roleId, RolePermissionTable.roleId))
        .innerJoin(PermissionTable, eq(RolePermissionTable.permissionId, PermissionTable.id))
        .innerJoin(ModuleTable, eq(PermissionTable.moduleId, ModuleTable.id))
        .leftJoin(PortalTable, eq(ModuleTable.portalId, PortalTable.id))
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


  /**
   * The portal a module belongs to — `agency`, `outlet`, `admin`, or null.
   *
   * This is what lets `requirePermission(moduleKey, verb)` work out WHICH
   * organisation to ask about without every one of its ~40 call sites having
   * to say so. The module already knew; nothing was reading it.
   */
  async modulePortalCode(moduleKey: string): Promise<string | null> {
    const codes = await this.modulePortalCodes(moduleKey);
    return codes[0] ?? null;
  }

  /**
   * EVERY portal a module key belongs to — because several belong to more than
   * one, and `limit(1)` was picking between them by accident.
   *
   * ⚠️ `settings`, `dashboard` and `history` each exist as a SEPARATE module row
   * per portal. `modulePortalCode` asked for one row with no ORDER BY, so which
   * portal `requirePermission('settings','update')` resolved was whatever the
   * planner returned first — and that decided WHICH ORGANISATION the guard then
   * asked about. An outlet operator's request could be judged against their
   * agency membership, or the reverse.
   *
   * Sorted, so a caller that must still choose one gets a stable answer rather
   * than a different one per query plan.
   */
  async modulePortalCodes(moduleKey: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ code: PortalTable.code })
        .from(ModuleTable)
        .leftJoin(PortalTable, eq(PortalTable.id, ModuleTable.portalId))
        .where(
          and(
            eq(ModuleTable.moduleKey, moduleKey),
            eq(ModuleTable.status, 'active'),
          ),
        );
      return [
        ...new Set(
          rows.map((r) => r.code).filter((c): c is string => Boolean(c)),
        ),
      ].sort();
    } catch (error) {
      logger.error('[AuthRepository.modulePortalCodes] Error:', error);
      return [];
    }
  }

  /**
   * Does THIS ROLE grant `permissionType` on `moduleKey`?
   *
   * The twin of `userHasPermission`, asked of one role instead of the union
   * of a person's roles. That difference is the point: a person's roles are
   * global, so the union answers *what may this person do anywhere*, while a
   * job title belongs to one organisation and must answer *what may they do
   * HERE*. The caller resolves the title from the membership and passes the
   * role it maps to.
   *
   * Matched by NAME within a portal because that is how the seeds address
   * roles (`Owner@agency`, `Ops Head@outlet`) and how `portalRoleNameForSubRole`
   * speaks. Never softens to true on error — an unreadable grant table is not
   * permission.
   */
  /**
   * EVERY GRANT HELD BY A SET OF (role name, portal) PAIRS.
   *
   * ⚠️ The twin of `getUserPermissions`, and it exists because that one asks
   * the WRONG QUESTION for `/auth/me`. It unions the account's `user_role`
   * rows, which say what a person may do ANYWHERE; authority here belongs to
   * the MEMBERSHIP lane, which says what they may do in one organisation. The
   * two had drifted on real accounts: a venue's Finance head and its Ops Head
   * both still carried an `Owner` role row from an earlier grant, so
   * `/auth/me` handed them `settings:update` and the portals offered them the
   * Edit button, the Pay button and the payment method — the exact three the
   * owner's rule reserves for the owner.
   *
   * The server itself was never fooled: `requirePermission` maps the
   * membership's `sub_role` through `portalRoleNameForSubRole` and asks
   * `roleHasPermission`, so every write was refused. It was the SCREEN that
   * lied, which is the thing the owner asked to stop.
   *
   * So `/auth/me` now asks this instead, with the lanes the caller actually
   * holds. Same table, same rows, same answer as the guard.
   */
  async permissionsForRoleNames(
    pairs: ReadonlyArray<{ roleName: string; portalCode: string }>,
  ): Promise<RolePermissionGroupType[]> {
    if (pairs.length === 0) return [];
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
          portalCode: PortalTable.code,
          // Returned so the caller can match a grant back to the lane that
          // asked for it, and tag it with that lane's organisation.
          roleName: RoleTable.roleName,
        })
        .from(RoleTable)
        .innerJoin(PortalTable, eq(RoleTable.portalId, PortalTable.id))
        .innerJoin(RolePermissionTable, eq(RolePermissionTable.roleId, RoleTable.id))
        .innerJoin(PermissionTable, eq(RolePermissionTable.permissionId, PermissionTable.id))
        .innerJoin(ModuleTable, eq(PermissionTable.moduleId, ModuleTable.id))
        .where(
          and(
            eq(RoleTable.status, 'active'),
            eq(PermissionTable.status, 'active'),
            eq(ModuleTable.status, 'active'),
            /*
             * The module must belong to the SAME portal as the role. Without
             * it a `settings` grant from the agency role would be returned for
             * an outlet lane, which is the cross-portal confusion the client
             * `portalCode` filter exists to catch — better not to send it.
             */
            eq(ModuleTable.portalId, RoleTable.portalId),
            or(
              ...pairs.map((p) =>
                and(
                  eq(RoleTable.roleName, p.roleName),
                  eq(PortalTable.code, p.portalCode),
                ),
              ),
            ),
          ),
        );
      return results;
    } catch (error) {
      // Never soften to a wider list: an unreadable grant table is not permission.
      logger.error('[AuthRepository.permissionsForRoleNames] Error:', error);
      return [];
    }
  }

  async roleHasPermission(
    roleName: string,
    portalCode: string,
    moduleKey: string,
    permissionType: 'create' | 'read' | 'update',
  ): Promise<boolean> {
    try {
      const [row] = await db
        .select({ id: RolePermissionTable.id })
        .from(RoleTable)
        .innerJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId))
        .innerJoin(
          RolePermissionTable,
          eq(RolePermissionTable.roleId, RoleTable.id),
        )
        .innerJoin(
          PermissionTable,
          eq(PermissionTable.id, RolePermissionTable.permissionId),
        )
        .innerJoin(ModuleTable, eq(ModuleTable.id, PermissionTable.moduleId))
        .where(
          and(
            eq(RoleTable.roleName, roleName),
            eq(RoleTable.status, 'active'),
            eq(PortalTable.code, portalCode),
            eq(PermissionTable.status, 'active'),
            eq(ModuleTable.status, 'active'),
            eq(ModuleTable.moduleKey, moduleKey),
            eq(PermissionTable.permissionType, permissionType),
          ),
        )
        .limit(1);
      return Boolean(row);
    } catch (error) {
      logger.error('[AuthRepository.roleHasPermission] Error:', error);
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

  /**
   * The one write every password path shares — the emailed reset link, the PR
   * app's WhatsApp-OTP reset, and the signed-in change.
   *
   * 🔴 IT ALSO ENDS THE SESSIONS THAT PASSWORD OPENED. `sessions_valid_from`
   * is stamped here rather than at the three call sites, because the whole
   * point of a change like this is that the next path added cannot forget it.
   * `authenticate-jwt` refuses any token issued before the stamp.
   *
   * The person changing their own password is not thrown out: the check refuses
   * tokens issued STRICTLY earlier than this moment, and their own client
   * re-authenticates afterwards.
   */
  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(UserTable)
      .set({ passwordHash, sessionsValidFrom: new Date(), updatedAt: new Date() })
      .where(eq(UserTable.id, userId));
  }
}
