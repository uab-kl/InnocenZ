import { eq, and, isNull, sql, ne } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable, RoleType, RoleInsertType } from './role.model';
import { PortalTable } from '../portal/portal.model';
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

  /** Case-insensitive name unique within the same portal (null portal = unassigned). */
  async findByNameAndPortal(
    roleName: string,
    portalId: string | null | undefined,
    excludeRoleId?: string,
  ): Promise<RoleType | null> {
    try {
      const nameKey = roleName.trim().toLowerCase();
      const portalMatch =
        portalId == null || portalId === ''
          ? isNull(RoleTable.portalId)
          : eq(RoleTable.portalId, portalId);
      const conditions = [
        sql`lower(${RoleTable.roleName}) = ${nameKey}`,
        portalMatch,
      ];
      if (excludeRoleId) {
        conditions.push(ne(RoleTable.id, excludeRoleId));
      }
      const [role] = await db
        .select()
        .from(RoleTable)
        .where(and(...conditions))
        .limit(1);
      return role ?? null;
    } catch (error) {
      logger.error('[RoleRepository.findByNameAndPortal] Error:', error);
      return null;
    }
  }

  /** Resolve seeded role by display name + portal.code (or null portal). */
  async findByNameAndPortalCode(
    roleName: string,
    portalCode: string | null,
  ): Promise<RoleType | null> {
    try {
      if (portalCode == null) {
        return this.findByNameAndPortal(roleName, null);
      }
      const [portal] = await db
        .select({ id: PortalTable.id })
        .from(PortalTable)
        .where(eq(PortalTable.code, portalCode))
        .limit(1);
      if (!portal) return null;
      return this.findByNameAndPortal(roleName, portal.id);
    } catch (error) {
      logger.error('[RoleRepository.findByNameAndPortalCode] Error:', error);
      return null;
    }
  }

  /** portalId to portal code, for stamping a whole list in one round trip. */
  async getPortalCodeMap(): Promise<Map<string, string>> {
    const portals = await db
      .select({ id: PortalTable.id, code: PortalTable.code })
      .from(PortalTable);
    return new Map(portals.map((p) => [p.id, p.code]));
  }

  /** The portal CODE behind a role's portalId — null for an unassigned role. */
  async getPortalCodeForRole(portalId: string | null): Promise<string | null> {
    if (portalId == null || portalId === '') return null;
    const [portal] = await db
      .select({ code: PortalTable.code })
      .from(PortalTable)
      .where(eq(PortalTable.id, portalId))
      .limit(1);
    return portal?.code ?? null;
  }

  /**
   * Delete a role, but ONLY if nothing references it — counted and deleted in
   * ONE transaction.
   *
   * Why the counts live in here rather than the controller: three of the four
   * foreign keys pointing at role(id) are ON DELETE NO ACTION, so a grant landing
   * between a separate check and the delete would surface as a raw 23503. The
   * fourth is the dangerous one — `subscription.role_id` is ON DELETE SET NULL,
   * so it does NOT block: without an explicit count, deleting a role would
   * silently null the role a paid plan grants, with no error and no audit trail.
   * Counting inside the transaction closes that window for all four.
   *
   * ⚠️ This THROWS on a database error, deliberately. The existing
   * `countUsersWithRole` returns 0 on failure, which fails CLOSED for the revoke
   * guard it was written for (`holders <= 1` refuses) and would fail OPEN here —
   * a blip would read as "nobody holds it, go ahead". A delete must refuse when
   * it cannot prove the role is unused.
   */
  async deleteRoleIfUnreferenced(roleId: string): Promise<
    | { ok: true }
    | {
        ok: false;
        blockers: {
          holders: number;
          permissions: number;
          invites: number;
          subscriptions: number;
        };
      }
  > {
    logger.info('[RoleRepository.deleteRoleIfUnreferenced] Checking references...');
    return await db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        select
          (select count(distinct user_id) from main.user_role where role_id = ${roleId})::int as holders,
          (select count(*) from main.role_permission where role_id = ${roleId})::int as permissions,
          (select count(*) from main.org_member_invite where role_id = ${roleId})::int as invites,
          (select count(*) from main.subscription where role_id = ${roleId})::int as subscriptions
      `);
      const rows = (Array.isArray(result)
        ? result
        : ((result as { rows?: unknown[] }).rows ?? [])) as Array<{
        holders: number;
        permissions: number;
        invites: number;
        subscriptions: number;
      }>;
      const counts = rows[0];
      if (!counts) {
        // The count query answering NOTHING is not the same as answering zero.
        throw new Error('Could not read this role references');
      }
      const blockers = {
        holders: Number(counts.holders) || 0,
        permissions: Number(counts.permissions) || 0,
        invites: Number(counts.invites) || 0,
        subscriptions: Number(counts.subscriptions) || 0,
      };
      if (Object.values(blockers).some((n) => n > 0)) {
        return { ok: false as const, blockers };
      }
      await tx.delete(RoleTable).where(eq(RoleTable.id, roleId));
      logger.info('[RoleRepository.deleteRoleIfUnreferenced] Role deleted');
      return { ok: true as const };
    });
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
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw error;
      }
      return null;
    }
  }

}
