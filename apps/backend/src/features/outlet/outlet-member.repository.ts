import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { ActorUser, actorJoinOn, actorNameColumn } from '@/util/actor-name';
import { logger } from '@/util/logger';
import {
  ensureAccountCodeFromMembership,
  nextOrgMemberCode,
} from '@/util/member-code';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
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
  /** WHO LAST SWITCHED THIS MEMBERSHIP OFF, by name — joined from
   * `updated_by`, never stored. Null for `'system'` or a deleted account.
   * See `util/actor-name.ts`; twin of `AgencyMemberEnriched.updatedByName`. */
  updatedByName: string | null;
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

/**
 * WHERE A JOB TITLE COMES FROM, since 0160: the membership row itself.
 *
 * There used to be an `outletLanesByUserIds` here that joined
 * `user_role → role → portal`, folded the result through `laneFromRoleHints`
 * and returned a Map keyed on USER id. It could not be organisation-aware:
 * `user_role` has no organisation on it, so one person held one title across
 * every venue they staffed, and every fallback in that chain landed on
 * `owner` — a member with no role read as a full-privilege owner.
 *
 * `outlet_user.sub_role` answers the question directly, so the derivation is
 * DELETED rather than fixed. `user_role` still answers the other question —
 * may this person open the portal at all.
 */

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
    /*
     * `memberCode` is OPTIONAL here even though the column is NOT NULL: this
     * function mints it. Callers that already hold one (the backfill, a
     * transfer) may pass it; nobody else should have to know how ids are made.
     */
    data: Omit<OutletUserInsertType, 'id' | 'createdAt' | 'updatedAt' | 'memberCode'> & {
      memberCode?: string;
    },
    tx?: DbTransaction,
  ): Promise<OutletUserType> {
    try {
      const dbClient = tx ?? db;
      const withCode = {
        ...data,
        /*
         * `tx` is passed on purpose: sign-up creates the venue and this row in
         * ONE transaction, and a lookup outside it cannot see the venue.
         *
         * Not a ternary any more: the column is NOT NULL (0159), so this has to
         * resolve to a string on BOTH branches — a caller-supplied id or a
         * freshly minted one. `nextOrgMemberCode` throws rather than returning
         * nothing, which aborts the membership instead of weakening it.
         */
        memberCode:
          data.memberCode ?? (await nextOrgMemberCode('outlet', data.outletId, tx)),
      };
      const [member] = await dbClient
        .insert(OutletUserTable)
        .values(withCode)
        .returning();
      // The same id is mirrored onto `user` so no account is left without one
      // (owner, 9 Sep 2026). This row stays authoritative — see the note on
      // `ensureAccountCodeFromMembership`.
      await ensureAccountCodeFromMembership(data.userId, tx);
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
    return { ...member, subRole: member.subRole as OutletUserSubRole };
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
          subRole: OutletUserTable.subRole,
          memberCode: OutletUserTable.memberCode,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          updatedByName: actorNameColumn,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(OutletUserTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
        .leftJoin(ActorUser, actorJoinOn(OutletUserTable.updatedBy))
        .where(eq(OutletUserTable.outletId, outletId))
        .orderBy(OutletUserTable.createdAt);

      return rows.map((r) => ({
        ...r,
        subRole: r.subRole as OutletUserSubRole,
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
          subRole: OutletUserTable.subRole,
          memberCode: OutletUserTable.memberCode,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          updatedByName: actorNameColumn,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          outletName: OutletTable.name,
          outletStatus: OutletTable.status,
        })
        .from(OutletUserTable)
        .innerJoin(UserTable, eq(UserTable.id, OutletUserTable.userId))
        .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
        // LEFT — an archive must not hide the rows a cron job or a deleted
        // account switched off. See `util/actor-name.ts`.
        .leftJoin(ActorUser, actorJoinOn(OutletUserTable.updatedBy))
        .where(where)
        // Venue, then person, then id — a TOTAL order, so no row lands on two
        // pages when two memberships share a created_at.
        .orderBy(OutletTable.name, UserTable.username, OutletUserTable.id)
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      return {
        rows: rows.map((r) => ({
          ...r,
          subRole: r.subRole as OutletUserSubRole,
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
          subRole: OutletUserTable.subRole,
          memberCode: OutletUserTable.memberCode,
        })
        .from(OutletUserTable)
        .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
        .where(and(...conditions))
        .orderBy(OutletTable.name);

      return rows.map((r) => ({
        ...r,
        subRole: r.subRole as OutletUserSubRole,
      }));
    } catch (error) {
      logger.error(
        '[OutletMemberRepository.listMembershipsByUserIds] Error:',
        error,
      );
      return [];
    }
  }

  /** The venue twin of `AgencyMemberRepository.remove` — see the note there
   * for why `actor` is required rather than optional. */
  async remove(
    id: string,
    actor: string,
    tx?: DbTransaction,
  ): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(OutletUserTable)
        .set({ status: 'inactive', updatedAt: new Date(), updatedBy: actor })
        .where(eq(OutletUserTable.id, id));
      return true;
    } catch (error) {
      logger.error('[OutletMemberRepository.remove] Error:', error);
      return false;
    }
  }
}
