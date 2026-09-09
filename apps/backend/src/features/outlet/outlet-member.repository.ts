import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { nextOrgMemberCode } from '@/util/member-code';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { laneFromRoleHints } from '@/features/rbac/portal-role-map';
import {
  OutletUserTable,
  OutletUserInsertType,
  OutletUserType,
  OutletUserSubRole,
  OutletTable,
} from './outlet.model';

/** One row of the admin cross-venue "Team members" list: the membership, the
  * person, and the venue it belongs to. */
export type OutletTeamMemberRow = OutletMemberEnriched & {
  outletName: string;
  outletStatus: string;
};

export type OutletMemberEnriched = OutletUserType & {
  /** Derived from `user_role` → `role` (outlet portal). */
  subRole: OutletUserSubRole;
  username: string;
  email: string | null;
  phoneNum: string | null;
};

/** One outlet membership joined to its outlet — used to resolve a signed-in
 * operator's own outlet + role at session start (mirrors the agency side).
 * `outletStatus` is the organisation's status (`pending_review` / `active` / …),
 * distinct from the membership row's own `status`. */
export type OutletMembershipWithOutlet = {
  /** This membership’s own id — INNEMOLT0001. */
  memberCode: string | null;
  membershipId: string;
  userId: string;
  outletId: string;
  outletName: string;
  outletStatus: string;
  /** Derived from RBAC, not a column on outlet_user. */
  subRole: OutletUserSubRole;
  status: string;
};

async function outletLanesByUserIds(
  userIds: string[],
): Promise<Map<string, OutletUserSubRole>> {
  const map = new Map<string, OutletUserSubRole>();
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
    .where(inArray(UserRoleTable.userId, userIds))
    // ORDERED — the twin of the agency lane query. `laneFromRoleHints` takes the
    // FIRST hint for the portal, so without this a member holding two outlet-portal
    // roles lands in an arbitrary department that can change between requests.
    .orderBy(RoleTable.roleName, UserRoleTable.roleId);

  const byUser = new Map<
    string,
    Array<{ portalCode: string | null; roleName: string }>
  >();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({
      portalCode: row.portalCode,
      roleName: row.roleName ?? 'Owner',
    });
    byUser.set(row.userId, list);
  }
  for (const userId of userIds) {
    map.set(userId, laneFromRoleHints('outlet', byUser.get(userId) ?? []));
  }
  return map;
}

export class OutletMemberRepositoryClass {
  /**
   * The ONLY insert into this table — so the human-readable id is minted here,
   * where every path that creates a membership must pass: sign-up (inside its
   * own transaction, which this inherits through ) and invite-accept.
   *
   * A caller may pass its own ; the backfill does. Otherwise one is
   * issued now, numbered within this organisation.
   */
  async add(
    data: Omit<OutletUserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OutletUserType> {
    try {
      const dbClient = tx ?? db;
      const withCode = data.memberCode
        ? data
        : {
            ...data,
            // `tx` is passed on purpose: sign-up creates the venue and this row
            // in ONE transaction, and a lookup outside it cannot see the venue.
            memberCode:
              (await nextOrgMemberCode('outlet', data.outletId, tx)) ?? null,
          };
      // A missing id is the one failure this must never do QUIETLY: a null reads
      // exactly like a row the backfill has not reached, so nobody goes looking.
      if (!withCode.memberCode) {
        logger.error(
          `[OutletMemberRepository.add] NO MEMBER ID minted for outlet ${data.outletId} — the organisation is missing or its name has no letters`,
        );
      }
      const [member] = await dbClient
        .insert(OutletUserTable)
        .values(withCode)
        .returning();
      logger.info('[OutletMemberRepository.add] Member added:', member.id);
      return member;
    } catch (error) {
      logger.error('[OutletMemberRepository.add] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<OutletUserInsertType>,
    tx?: DbTransaction,
  ): Promise<OutletUserType | null> {
    try {
      const dbClient = tx ?? db;
      const [member] = await dbClient
        .update(OutletUserTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OutletUserTable.id, id))
        .returning();
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.update] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<OutletUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(OutletUserTable)
        .where(eq(OutletUserTable.id, id))
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.getById] Error:', error);
      return null;
    }
  }

  async getByIdEnriched(
    id: string,
  ): Promise<(OutletUserType & { subRole: OutletUserSubRole }) | null> {
    const member = await this.getById(id);
    if (!member) return null;
    const lanes = await outletLanesByUserIds([member.userId]);
    return { ...member, subRole: lanes.get(member.userId) ?? 'owner' };
  }

  async getByOutletAndUser(
    outletId: string,
    userId: string,
  ): Promise<OutletUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(OutletUserTable)
        .where(
          and(
            eq(OutletUserTable.outletId, outletId),
            eq(OutletUserTable.userId, userId),
          ),
        )
        .limit(1);
      return member ?? null;
    } catch (error) {
      logger.error('[OutletMemberRepository.getByOutletAndUser] Error:', error);
      return null;
    }
  }

  async listByOutlet(outletId: string): Promise<OutletMemberEnriched[]> {
    return this.listByOutletWithUser(outletId);
  }

  async listByOutletWithUser(
    outletId: string,
  ): Promise<OutletMemberEnriched[]> {
    try {
      const rows = await db
        .select({
          id: OutletUserTable.id,
          outletId: OutletUserTable.outletId,
          userId: OutletUserTable.userId,
          status: OutletUserTable.status,
          memberCode: OutletUserTable.memberCode,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(OutletUserTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
        .where(eq(OutletUserTable.outletId, outletId))
        .orderBy(OutletUserTable.createdAt);

      const lanes = await outletLanesByUserIds(rows.map((r) => r.userId));
      return rows.map((r) => ({
        ...r,
        subRole: lanes.get(r.userId) ?? ('owner' as OutletUserSubRole),
      }));
    } catch (error) {
      logger.error(
        '[OutletMemberRepository.listByOutletWithUser] Error:',
        error,
      );
      return [];
    }
  }

  /**
   * Every venue operator on the platform, across ALL venues — the admin's
   * "Team members" screen. The twin of `AgencyMemberRepository.listAllEnriched`,
   * including its rule that `subRole` is returned but NOT filterable: the lane
   * is derived per user after the page is fetched, so filtering it would punch
   * holes in an already-paginated page.
   *
   * `listByOutletWithUser` above could not be widened — it takes no options at
   * all, has no LIMIT/OFFSET and never joins `outlet`.
   */
  async listAllEnriched(options: {
    search?: string;
    status?: string;
    /** Narrow to ONE venue — the deep link from that venue's Team tab. */
    outletId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: OutletTeamMemberRow[]; totalCount: number }> {
    try {
      const conditions = [];
      if (options.outletId) {
        conditions.push(eq(OutletUserTable.outletId, options.outletId));
      }
      if (options.status) {
        conditions.push(eq(OutletUserTable.status, options.status));
      }
      if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`;
        conditions.push(
          or(
            ilike(UserTable.username, term),
            ilike(UserTable.email, term),
            ilike(UserTable.phoneNum, term),
            ilike(OutletTable.name, term),
          )!,
        );
      }
      const where = conditions.length ? and(...conditions) : undefined;

      const [{ value: totalCount }] = await db
        .select({ value: count() })
        .from(OutletUserTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
        .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
        .where(where);

      const rows = await db
        .select({
          id: OutletUserTable.id,
          outletId: OutletUserTable.outletId,
          userId: OutletUserTable.userId,
          status: OutletUserTable.status,
          memberCode: OutletUserTable.memberCode,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          outletName: OutletTable.name,
          outletStatus: OutletTable.status,
        })
        .from(OutletUserTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
        .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
        .where(where)
        // Venue, then person, then id — a TOTAL order, so no row lands on two
        // pages when two memberships share a created_at.
        .orderBy(OutletTable.name, UserTable.username, OutletUserTable.id)
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      const lanes = await outletLanesByUserIds(rows.map((r) => r.userId));
      return {
        rows: rows.map((r) => ({
          ...r,
          subRole: lanes.get(r.userId) ?? ('owner' as OutletUserSubRole),
        })),
        totalCount: Number(totalCount ?? 0),
      };
    } catch (error) {
      logger.error('[OutletMemberRepository.listAllEnriched] Error:', error);
      return { rows: [], totalCount: 0 };
    }
  }

  /**
   * ORDERED, for the same reason as the agency twin: `resolveOrgScope` builds
   * `outletIds` from this, and `special-service`'s scoped filter then takes
   * `scope.outletIds[0]` — an operator of several venues sees "the first", which
   * with no `ORDER BY` was whichever row Postgres emitted and could change
   * between requests. Stable, not necessarily correct: a multi-venue filter is
   * the real fix, and that file already says so.
   */
  async listByUser(userId: string): Promise<OutletUserType[]> {
    try {
      return db
        .select()
        .from(OutletUserTable)
        .where(eq(OutletUserTable.userId, userId))
        .orderBy(OutletUserTable.createdAt, OutletUserTable.id);
    } catch (error) {
      logger.error('[OutletMemberRepository.listByUser] Error:', error);
      return [];
    }
  }

  /** Memberships (joined to their outlet) for the given users — resolves a
   * signed-in operator's own outlet + role at session start. */
  async listMembershipsByUserIds(
    userIds: string[],
    options: { status?: string } = {},
  ): Promise<OutletMembershipWithOutlet[]> {
    if (userIds.length === 0) return [];
    try {
      const conditions = [inArray(OutletUserTable.userId, userIds)];
      if (options.status) {
        conditions.push(eq(OutletUserTable.status, options.status));
      }
      const rows = await db
        .select({
          membershipId: OutletUserTable.id,
          userId: OutletUserTable.userId,
          outletId: OutletUserTable.outletId,
          outletName: OutletTable.name,
          outletStatus: OutletTable.status,
          status: OutletUserTable.status,
          memberCode: OutletUserTable.memberCode,
        })
        .from(OutletUserTable)
        .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
        .where(and(...conditions))
        .orderBy(OutletTable.name);

      const lanes = await outletLanesByUserIds(rows.map((r) => r.userId));
      return rows.map((r) => ({
        ...r,
        subRole: lanes.get(r.userId) ?? ('owner' as OutletUserSubRole),
      }));
    } catch (error) {
      logger.error(
        '[OutletMemberRepository.listMembershipsByUserIds] Error:',
        error,
      );
      return [];
    }
  }

  async remove(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(OutletUserTable)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(OutletUserTable.id, id));
      return true;
    } catch (error) {
      logger.error('[OutletMemberRepository.remove] Error:', error);
      return false;
    }
  }
}
