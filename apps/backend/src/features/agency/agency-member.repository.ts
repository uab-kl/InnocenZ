import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import {
  ensureAccountCodeFromMembership,
  nextOrgMemberCode,
} from '@/util/member-code';
import { DbTransaction } from '@/types/db-transaction';
import { UserTable } from '@/features/user/user.model';
import {
  AgencyUserTable,
  AgencyUserInsertType,
  AgencyUserType,
  AgencyUserSubRole,
  AgencyTable,
} from './agency.model';

/** One row of the admin cross-agency "Team members" list: the membership,
  * the person, and the agency it belongs to. */
export type AgencyTeamMemberRow = AgencyMemberEnriched & {
  agencyName: string;
  agencyCode: string;
  agencyStatus: string;
};

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
  /** This membership’s own id — INNATAGY0001. Selected all along; naming it here
      is what lets it reach the client. */
  memberCode: string | null;
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

/**
 * WHERE A JOB TITLE COMES FROM, since 0160: the membership row itself.
 *
 * There used to be a `agencyLanesByUserIds` here that joined
 * `user_role → role → portal`, folded the result through `laneFromRoleHints`
 * and returned a Map keyed on USER id. It could not be organisation-aware:
 * `user_role` has no organisation on it, so one person held one title across
 * every agency they belonged to, and every fallback in that chain landed
 * on `owner` — a member with no role read as a full-privilege owner.
 *
 * `agency_user.sub_role` answers the question directly, so the
 * derivation is DELETED rather than fixed. `user_role` still answers the
 * other question — may this person open the portal at all.
 */

export class AgencyMemberRepositoryClass {
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
    data: Omit<AgencyUserInsertType, 'id' | 'createdAt' | 'updatedAt' | 'memberCode'> & {
      memberCode?: string;
    },
    tx?: DbTransaction,
  ): Promise<AgencyUserType> {
    try {
      const dbClient = tx ?? db;
      const withCode = {
        ...data,
        /*
         * `tx` is passed on purpose: sign-up creates the agency and this row in
         * ONE transaction, and a lookup outside it cannot see the agency.
         *
         * Not a ternary any more: the column is NOT NULL (0159), so this has to
         * resolve to a string on BOTH branches — a caller-supplied id or a
         * freshly minted one. `nextOrgMemberCode` throws rather than returning
         * nothing, which aborts the membership instead of weakening it.
         */
        memberCode:
          data.memberCode ?? (await nextOrgMemberCode('agency', data.agencyId, tx)),
      };
      const [member] = await dbClient
        .insert(AgencyUserTable)
        .values(withCode)
        .returning();
      // The same id is mirrored onto `user` so no account is left without one
      // (owner, 9 Sep 2026). This row stays authoritative — see the note on
      // `ensureAccountCodeFromMembership`.
      await ensureAccountCodeFromMembership(data.userId, tx);
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
  async getByIdEnriched(
    id: string,
  ): Promise<(AgencyUserType & { subRole: AgencyUserSubRole }) | null> {
    const member = await this.getById(id);
    if (!member) return null;
    return { ...member, subRole: member.subRole as AgencyUserSubRole };
  }

  async getByAgencyAndUser(
    agencyId: string,
    userId: string,
  ): Promise<AgencyUserType | null> {
    try {
      const [member] = await db
        .select()
        .from(AgencyUserTable)
        .where(
          and(
            eq(AgencyUserTable.agencyId, agencyId),
            eq(AgencyUserTable.userId, userId),
          ),
        )
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
          subRole: AgencyUserTable.subRole,
          memberCode: AgencyUserTable.memberCode,
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

      const enriched = rows.map((r) => ({
        ...r,
        subRole: r.subRole as AgencyUserSubRole,
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

  /**
   * Every agency operator on the platform, across ALL agencies — the admin's
   * "Team members" screen.
   *
   * Not a variant of `listByAgency`: that one is hard-wired to a single
   * `agency_id`, has no LIMIT/OFFSET, and never joins `agency`, so a row could
   * not say which agency it belongs to.
   *
   * `subRole` is returned per row and, SINCE 0160, could legitimately become
   * a filter here — it is a column on the row now, so it would go in the
   * WHERE clause before LIMIT/OFFSET like any other.
   *
   * It is still not offered, but the reason has changed and the old one must
   * not be quoted back: it used to be that the lane was DERIVED per user
   * after the page was fetched, so filtering would have dropped rows from an
   * already-paginated page and handed back short pages with a total that
   * disagreed. That constraint is gone. Adding the filter is now a product
   * decision about the admin screen, not a thing the data forbids.
   */
  async listAllEnriched(options: {
    search?: string;
    status?: string;
    /** Narrow to ONE agency — the deep link from that agency's Team tab. */
    agencyId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: AgencyTeamMemberRow[]; totalCount: number }> {
    try {
      const conditions = [];
      if (options.agencyId) {
        conditions.push(eq(AgencyUserTable.agencyId, options.agencyId));
      }
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
            // The agency name too: "show me everyone at Atlas" is the first
            // thing anyone types into a cross-organisation list.
            ilike(AgencyTable.name, term),
            ilike(AgencyTable.agencyCode, term),
          )!,
        );
      }
      const where = conditions.length ? and(...conditions) : undefined;

      const [{ value: totalCount }] = await db
        .select({ value: count() })
        .from(AgencyUserTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyUserTable.userId))
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
        .where(where);

      const rows = await db
        .select({
          id: AgencyUserTable.id,
          agencyId: AgencyUserTable.agencyId,
          userId: AgencyUserTable.userId,
          status: AgencyUserTable.status,
          subRole: AgencyUserTable.subRole,
          memberCode: AgencyUserTable.memberCode,
          createdAt: AgencyUserTable.createdAt,
          updatedAt: AgencyUserTable.updatedAt,
          createdBy: AgencyUserTable.createdBy,
          updatedBy: AgencyUserTable.updatedBy,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          agencyStatus: AgencyTable.status,
        })
        .from(AgencyUserTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyUserTable.userId))
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
        .where(where)
        // Organisation first, then the person: the screen is read by agency.
        // `id` last so the order is TOTAL — two members created in the same
        // transaction share a timestamp, and a partial order lets a row appear
        // on two pages or on neither.
        .orderBy(AgencyTable.name, UserTable.username, AgencyUserTable.id)
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      return {
        rows: rows.map((r) => ({
          ...r,
          subRole: r.subRole as AgencyUserSubRole,
        })),
        totalCount: Number(totalCount ?? 0),
      };
    } catch (error) {
      logger.error('[AgencyMemberRepository.listAllEnriched] Error:', error);
      return { rows: [], totalCount: 0 };
    }
  }

  /**
   * ORDERED, because callers pick ONE row out of this and the choice must not
   * change between requests.
   *
   * `activeAgencyId` — and the four scope resolvers that share it — take the
   * FIRST active membership. With no `ORDER BY` that was whichever row Postgres
   * happened to emit, which is free to change after a VACUUM or a plan change.
   * An operator who staffs two agencies could therefore read one agency's
   * roster and vouchers on one request and the other's on the next, silently
   * and with no error; `requireOutletScopeByParam` turns the same instability
   * into an intermittent 403 on a venue they legitimately manage.
   *
   * Oldest first is NOT a claim that the oldest membership is the right one —
   * for a genuine multi-agency operator there is no right answer without asking
   * them, and an explicit agency switcher is the real fix. This makes the answer
   * STABLE, which is the part that can be fixed here. `id` breaks ties so rows
   * created in the same transaction still order deterministically.
   */
  async listByUser(userId: string): Promise<AgencyUserType[]> {
    try {
      return db
        .select()
        .from(AgencyUserTable)
        .where(eq(AgencyUserTable.userId, userId))
        .orderBy(AgencyUserTable.createdAt, AgencyUserTable.id);
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
          subRole: AgencyUserTable.subRole,
          memberCode: AgencyUserTable.memberCode,
        })
        .from(AgencyUserTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
        .where(and(...conditions))
        .orderBy(AgencyTable.name);

      const enriched = rows.map((r) => ({
        ...r,
        subRole: r.subRole as AgencyUserSubRole,
      }));
      if (options.subRole) {
        return enriched.filter((r) => r.subRole === options.subRole);
      }
      return enriched;
    } catch (error) {
      logger.error(
        '[AgencyMemberRepository.listMembershipsByUserIds] Error:',
        error,
      );
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
