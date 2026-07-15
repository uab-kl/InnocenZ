import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { RoleTable } from '@/features/rbac/role/role.model.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import {
  SubscriptionRoleTable,
  SubscriptionRoleSummary,
  SubscriptionRoleType,
} from './subscription-role.model.js';

export class SubscriptionRoleRepositoryClass {
  async getRolesBySubscriptionId(subscriptionId: string): Promise<SubscriptionRoleSummary[]> {
    try {
      return await db
        .select({
          id: RoleTable.id,
          roleName: RoleTable.roleName,
        })
        .from(SubscriptionRoleTable)
        .innerJoin(RoleTable, eq(SubscriptionRoleTable.roleId, RoleTable.id))
        .where(eq(SubscriptionRoleTable.subscriptionId, subscriptionId));
    } catch (error) {
      logger.error('[SubscriptionRoleRepository.getRolesBySubscriptionId] Error:', error);
      return [];
    }
  }

  async getRolesBySubscriptionIds(
    subscriptionIds: string[],
  ): Promise<Map<string, SubscriptionRoleSummary[]>> {
    const map = new Map<string, SubscriptionRoleSummary[]>();
    if (subscriptionIds.length === 0) return map;

    try {
      const rows = await db
        .select({
          subscriptionId: SubscriptionRoleTable.subscriptionId,
          id: RoleTable.id,
          roleName: RoleTable.roleName,
        })
        .from(SubscriptionRoleTable)
        .innerJoin(RoleTable, eq(SubscriptionRoleTable.roleId, RoleTable.id))
        .where(inArray(SubscriptionRoleTable.subscriptionId, subscriptionIds));

      for (const row of rows) {
        const existing = map.get(row.subscriptionId) ?? [];
        existing.push({ id: row.id, roleName: row.roleName });
        map.set(row.subscriptionId, existing);
      }
    } catch (error) {
      logger.error('[SubscriptionRoleRepository.getRolesBySubscriptionIds] Error:', error);
    }

    return map;
  }

  async getSubscriptionIdsByRoleId(roleId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ subscriptionId: SubscriptionRoleTable.subscriptionId })
        .from(SubscriptionRoleTable)
        .where(eq(SubscriptionRoleTable.roleId, roleId));
      return rows.map((row) => row.subscriptionId);
    } catch (error) {
      logger.error('[SubscriptionRoleRepository.getSubscriptionIdsByRoleId] Error:', error);
      return [];
    }
  }

  async syncRoles(
    subscriptionId: string,
    roleIds: string[],
    createdBy: string,
    updatedBy: string,
    tx?: DbTransaction,
  ): Promise<SubscriptionRoleType[]> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .delete(SubscriptionRoleTable)
        .where(eq(SubscriptionRoleTable.subscriptionId, subscriptionId));

      if (roleIds.length === 0) return [];

      const rows = await dbClient
        .insert(SubscriptionRoleTable)
        .values(
          roleIds.map((roleId) => ({
            subscriptionId,
            roleId,
            createdBy,
            updatedBy,
          })),
        )
        .returning();

      logger.info('[SubscriptionRoleRepository.syncRoles] Roles synced for subscription:', subscriptionId);
      return rows;
    } catch (error) {
      logger.error('[SubscriptionRoleRepository.syncRoles] Error:', error);
      throw error;
    }
  }
}
