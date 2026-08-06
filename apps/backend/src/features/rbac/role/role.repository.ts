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
