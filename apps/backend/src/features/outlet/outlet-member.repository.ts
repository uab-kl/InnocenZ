import { and, count, eq, ilike, inArray, ne, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { ActorUser, actorJoinOn, actorNameColumn } from '@/util/actor-name';
import { logger } from '@/util/logger';
import type { MembershipStatus } from '@/util/membership-status';
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
  /**
   * The applicant's own photo, for the review screen.
   *
   * The member sign-up asks for one on the promise that it "helps the
   * organisation recognise you when they review your request" — a promise the
   * review screen could not keep, because this list never selected the
   * column. An owner admitting a stranger to their finances is the reader who
   * most needs a face beside the name.
   */
  profileImage: string | null;
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
  /** The venue's logo, so the login chooser can show a BRAND rather than
      the same generic glyph on every card. */
  logoImage: string | null;
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
      /*
       * ⚠️ A REAL ID ONLY FOR SOMEBODY WHO IS ACTUALLY JOINING (0161).
       *
       * This used to mint unconditionally, and `register-member` inserts at
       * `pending` — so merely ASKING to join took the venue's next number,
       * permanently: ids are never reused, so declining the request burned it.
       * Now a pending row falls through to the column DEFAULT and takes an
       * `INNPND` placeholder, and `updateMember` mints the real id at the
       * moment of approval.
       *
       * `tx` is passed on purpose: sign-up creates the venue and this row in ONE
       * transaction, and a lookup outside it cannot see the venue.
       *
       * A caller-supplied id still wins (the backfill, a transfer), and
       * `nextOrgMemberCode` still throws rather than returning nothing, which
       * aborts the membership instead of weakening it.
       */
      const minted =
        data.memberCode ??
        (data.status === 'active'
          ? await nextOrgMemberCode('outlet', data.outletId, tx)
          : undefined);
      const withCode = {
        ...data,
        // Omitted, not null — omitting is what lets the DEFAULT fire.
        ...(minted ? { memberCode: minted } : {}),
        /*
         * ⚠️ A ROW BORN ACTIVE IS ALREADY A MEMBERSHIP (0163).
         *
         * Organisation sign-up and invite-accept both insert straight at
         * `active`, so there is no later activation to stamp this. Without it
         * the owner of an agency would carry no first-activation date, and
         * removing them would read as a DECLINED APPLICANT — somebody who was
         * never on the team they founded.
         *
         * `activateOrgMembership` covers every row that is switched on LATER;
         * this covers the ones that never had a "later".
         */
        ...(data.status === 'active' ? { firstActivatedAt: new Date() } : {}),
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
          firstActivatedAt: OutletUserTable.firstActivatedAt,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          updatedByName: actorNameColumn,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          profileImage: UserTable.profileImage,
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
    /**
     * Show declined requests too — OFF unless asked (0162).
     *
     * Two admin screens read this one endpoint and want opposite things. The
     * MEMBERS table lists an organisation's people, and a turned-down request
     * is not one of them — owner: "why the decline member can show and search
     * by the atlas agency?". The LEGACY MEMBER table is the record of what
     * happened to everyone, and a decline is exactly the kind of thing it
     * exists to show — owner: "will show which user is status decline by who
     * which orgs".
     *
     * An explicit opt-in rather than a default, so the safe answer is the one
     * a caller gets by saying nothing.
     */
    includeRejected?: boolean;
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
      } else if (!options.includeRejected) {
        /*
         * ⚠️ A DECLINED APPLICANT IS NOT A MEMBER, ON THIS SCREEN EITHER (0162).
         *
         * Owner, 11 Sep 2026, finding one in the admin console: "why the decline
         * member can show and search by the atlas agency?"
         *
         * With no status asked for this list had no status condition at all, so a
         * turned-down request sat among the organisation's members — under a
         * MEMBER ID column, where the only thing it could show was the `INNPND`
         * placeholder that exists precisely BECAUSE no id was ever issued.
         * Searching the organisation's name returned them too.
         *
         * Excluded by DEFAULT rather than always: an admin who explicitly picks
         * "rejected" in the status filter is asking to see them, and answering
         * that with an empty table would be its own lie. The default is what had
         * to change, not the admin's reach.
         */
        conditions.push(ne(OutletUserTable.status, 'rejected'));
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
          firstActivatedAt: OutletUserTable.firstActivatedAt,
          createdAt: OutletUserTable.createdAt,
          updatedAt: OutletUserTable.updatedAt,
          createdBy: OutletUserTable.createdBy,
          updatedBy: OutletUserTable.updatedBy,
          updatedByName: actorNameColumn,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          profileImage: UserTable.profileImage,
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
          /*
           * THE ORGANISATION'S OWN LOGO, for the login chooser (owner, 11 Sep
           * 2026: "need show UI to let user know that which agency/outlet orgs
           * logo, what roles when choose that orgs").
           *
           * Somebody who works in three places is picking between BRANDS, not
           * reading a list of names — and the chooser drew the same generic
           * building glyph on every card, so the one thing that makes the
           * choice instant was the one thing missing.
           */
          logoImage: OutletTable.logoImage,
          status: OutletUserTable.status,
          subRole: OutletUserTable.subRole,
          memberCode: OutletUserTable.memberCode,
          firstActivatedAt: OutletUserTable.firstActivatedAt,
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
  /**
   * Take somebody off the roster — a DECLINE or a DEACTIVATION (0162).
   *
   * ⚠️ `nextStatus` is REQUIRED, and deliberately not defaulted. This used to
   * hard-code `'inactive'`, and the two events reach it through the SAME HTTP
   * call — the Decline button and the Team screen's Remove button both fire
   * `DELETE /:id/members/:memberId` — so one word was made to mean both
   * "turned down, never a member" and "was a member, removed". A declined
   * applicant then showed up on the organisation's roster.
   *
   * This function sees only an id and an actor, so it cannot decide; the
   * CONTROLLER can, because it has already loaded the row. `removalStatusFor`
   * is that decision, and a required parameter is what stops the next caller
   * silently inheriting the old conflation.
   */
  async remove(
    id: string,
    actor: string,
    nextStatus: MembershipStatus,
    tx?: DbTransaction,
  ): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient
        .update(OutletUserTable)
        .set({ status: nextStatus, updatedAt: new Date(), updatedBy: actor })
        .where(eq(OutletUserTable.id, id));
      return true;
    } catch (error) {
      logger.error('[OutletMemberRepository.remove] Error:', error);
      return false;
    }
  }
}
