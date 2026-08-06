import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { laneFromRoleHints } from '@/features/rbac/portal-role-map';
import {
  AgencyUserTable,
  AgencyUserInsertType,
  AgencyUserType,
  AgencyUserSubRole,
  AgencyTable,
} from './agency.model';

export type AgencyMemberEnriched = AgencyUserType & {
  /** Derived from `user_role` → `role` (agency portal). */
  subRole: AgencyUserSubRole;
  username: string;
  email: string | null;
  phoneNum: string | null;
};

/** `agencyStatus` is the organisation's status (`pending_review` / `active` / …),
 * distinct from the membership row's own `status`. */
export type AgencyMembershipWithAgency = {
  membershipId: string;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  agencyStatus: string;
  /** Derived from RBAC, not a column on agency_user. */
  subRole: AgencyUserSubRole;
  status: string;
};

export type ListMembersOptions = {
  subRole?: AgencyUserSubRole;
  status?: string;
  search?: string;
};

type RoleJoinRow = {
  userId: string;
  roleName: string | null;
  portalCode: string | null;
};

async function agencyLanesByUserIds(
  userIds: string[],
): Promise<Map<string, AgencyUserSubRole>> {
  const map = new Map<string, AgencyUserSubRole>();
  if (userIds.length === 0) return map;

  const rows = await db
    .select({
      userId: UserRoleTable.userId,
      roleName: RoleTable.roleName,
      portalCode: PortalTable.code,
    })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .leftJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId))
    .where(inArray(UserRoleTable.userId, userIds));

  const byUser = new Map<string, RoleJoinRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  for (const userId of userIds) {
    const hints = (byUser.get(userId) ?? []).map((r) => ({
      portalCode: r.portalCode,
      roleName: r.roleName ?? 'Owner',
    }));
    const lane = laneFromRoleHints('agency', hints);
    map.set(userId, lane === 'operations_head' ? 'finance' : lane);
  }
  return map;
}

export class AgencyMemberRepositoryClass {
  async add(
    data: Omit<AgencyUserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<AgencyUserType> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient.insert(AgencyUserTable).values(data).returning();
      logger.info('[AgencyMemberRepository.add] Member added:', member.id);
      return member;
    } catch (error) {
      logger.error('[AgencyMemberRepository.add] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<AgencyUserInsertType>,
    tx?: DbTransaction,
  ): Promise<AgencyUserType | null> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient
        .update(AgencyUserTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(AgencyUserTable.id, id))
        .returning();
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<AgencyUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyUserTable)
        .where(eq(AgencyUserTable.id, id))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.getById] Error:', error);
      return null;
    }
  }

  /** Membership + derived agency lane from RBAC. */
  async getByIdEnriched(id: string): Promise<(AgencyUserType & { subRole: AgencyUserSubRole }) | null> {
    const member = await this.getById(id);
    if (!member) return null;
    const lanes = await agencyLanesByUserIds([member.userId]);
    return { ...member, subRole: lanes.get(member.userId) ?? 'owner' };
  }

  async getByAgencyAndUser(agencyId: string, userId: string): Promise<AgencyUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyUserTable)
        .where(and(eq(AgencyUserTable.agencyId, agencyId), eq(AgencyUserTable.userId, userId)))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[AgencyMemberRepository.getByAgencyAndUser] Error:', error);
      return null;
    }
  }

  async listByAgency(
    agencyId: string,
    options: ListMembersOptions = {},
  ): Promise<AgencyMemberEnriched[]> {
    try {
      const conditions = [eq(AgencyUserTable.agencyId, agencyId)];
      if (options.status) {
        conditions.push(eq(AgencyUserTable.status, options.status));
      }
      if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`;
        conditions.push(
          or(
            ilike(UserTable.username, term),
            ilike(UserTable.email, term),
            ilike(UserTable.phoneNum, term),
          )!,
        );
      }

      const rows = await db
        .select({
          id: AgencyUserTable.id,
          agencyId: AgencyUserTable.agencyId,
          userId: AgencyUserTable.userId,
          status: AgencyUserTable.status,
          createdAt: AgencyUserTable.createdAt,
          updatedAt: AgencyUserTable.updatedAt,
          createdBy: AgencyUserTable.createdBy,
          updatedBy: AgencyUserTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(AgencyUserTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyUserTable.userId))
        .where(and(...conditions))
        .orderBy(AgencyUserTable.createdAt);

      const lanes = await agencyLanesByUserIds(rows.map((r) => r.userId));
      const enriched = rows.map((r) => ({
        ...r,
        subRole: lanes.get(r.userId) ?? ('owner' as AgencyUserSubRole),
      }));
      if (options.subRole) {
        return enriched.filter((r) => r.subRole === options.subRole);
      }
      return enriched;
    } catch (error) {
      logger.error('[AgencyMemberRepository.listByAgency] Error:', error);
      return [];
    }
  }

  async listByUser(userId: string): Promise<AgencyUserType[]> {
    try {
      return db
        .select()
        .from(AgencyUserTable)
        .where(eq(AgencyUserTable.userId, userId));
    } catch (error) {
      logger.error('[AgencyMemberRepository.listByUser] Error:', error);
      return [];
    }
  }

  async listMembershipsByUserIds(
    userIds: string[],
    options: { subRole?: AgencyUserSubRole; status?: string } = {},
  ): Promise<AgencyMembershipWithAgency[]> {
    if (userIds.length === 0) return [];

    try {
      const conditions = [inArray(AgencyUserTable.userId, userIds)];
      if (options.status) {
        conditions.push(eq(AgencyUserTable.status, options.status));
      }

      const rows = await db
        .select({
          membershipId: AgencyUserTable.id,
          userId: AgencyUserTable.userId,
          agencyId: AgencyUserTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          agencyStatus: AgencyTable.status,
          status: AgencyUserTable.status,
        })
        .from(AgencyUserTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
        .where(and(...conditions))
        .orderBy(AgencyTable.name);

      const lanes = await agencyLanesByUserIds(rows.map((r) => r.userId));
      const enriched = rows.map((r) => ({
        ...r,
        subRole: lanes.get(r.userId) ?? ('owner' as AgencyUserSubRole),
      }));
      if (options.subRole) {
        return enriched.filter((r) => r.subRole === options.subRole);
      }
      return enriched;
    } catch (error) {
      logger.error('[AgencyMemberRepository.listMembershipsByUserIds] Error:', error);
      return [];
    }
  }

  async remove(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(AgencyUserTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(AgencyUserTable.id, id));
      return true;
    } catch (error) {
      logger.error('[AgencyMemberRepository.remove] Error:', error);
      return false;
    }
  }
}
