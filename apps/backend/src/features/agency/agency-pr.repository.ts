import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import {
  AgencyPrTable,
  type AgencyPrApproveStatus,
  type AgencyPrType,
  type PrStatus,
  type PrTier,
} from '@/features/pr-personnel/pr.model';
import { UserTable } from '@/features/user/user.model';
import { logger } from '@/util/logger';

/**
 * PR-account ↔ agency membership (`agency_pr`), keyed by `user_id` (migration
 * 0085). `main.pr` is gone (0089): identity is read straight off `user` /
 * `user_profile` here — never through a `pr` row, which no longer exists.
 */

/** One agency a PR account belongs to. */
export type PrAgencyLink = {
  /** Always equal to `userId` post-cutover — kept on the shape for callers. */
  prId: string | null;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: AgencyPrApproveStatus;
  /**
   * THIS agency's grading of the PR (`agency_pr.tier`), e.g. 'tier_3'.
   *
   * Per-membership, not global: a PR can be tier_3 at one agency and tier_1 at
   * another, and both are true. It is carried here because the PR's own phone
   * profile printed a hardcoded "TIER V" — a tier that exists nowhere in the
   * database — beside a Manage-PR card reading tier_3 off this very row.
   * Null only when the agency has not graded them yet.
   */
  tier: string | null;
};

/** A PR on an agency's membership list, with account fields folded in. */
export type AgencyPrEnriched = {
  /** Membership row id — use for approve/reject (not the retired pr.id). */
  id: string;
  /** Always equal to `userId` post-cutover — so `rosterRowFromMembership` can
   * still key off it (kept name for callers, but there is no more `pr` row
   * behind it). */
  prId: string | null;
  /** No backing state anymore — `main.pr.status` (incl. `suspended`) is gone
   * with the table. Always `null`; kept on the shape for callers. */
  prStatus: PrStatus | null;
  agencyId: string;
  userId: string;
  name: string;
  nickname: string | null;
  approveStatus: AgencyPrApproveStatus;
  tier: PrTier;
  rejectReason: string | null;
  username: string | null;
  email: string | null;
  phoneNum: string | null;
  idNo: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  profileImage: string | null;
  gender: string | null;
  race: string | null;
  /** Spoken languages the PR set on their own profile — `user_profile.languages`. */
  languages: string[] | null;
  /** ISO date or drizzle date string. */
  dob: string | Date | null;
  nationality: string | null;
  portfolioPhotos: (string | null)[] | null;
  comcardImage: string | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
  comcardBustCm: number | null;
  comcardWaistCm: number | null;
  comcardHipCm: number | null;
  /** Agency-side roster grading (0089) — null when unset. */
  place: string | null;
  yearsExp: number | null;
  kpiTier: string | null;
  payClass: string | null;
};

export class AgencyPrRepository {
  /** Every agency each of these user accounts is under. */
  async listLinksByUserIds(userIds: string[]): Promise<PrAgencyLink[]> {
    if (userIds.length === 0) return [];

    try {
      const rows = await db
        .select({
          userId: AgencyPrTable.userId,
          agencyId: AgencyPrTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          approveStatus: AgencyPrTable.approveStatus,
          tier: AgencyPrTable.tier,
        })
        .from(AgencyPrTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyPrTable.agencyId))
        .where(inArray(AgencyPrTable.userId, userIds))
        .orderBy(AgencyTable.name);

      // `agency_pr` is unique on (agencyId, userId) — one row per link
      // already, no drifted-duplicate `pr` rows to collapse anymore.
      return rows.map((row) => ({ ...row, prId: row.userId }));
    } catch (error) {
      logger.error('[AgencyPrRepository.listLinksByUserIds] Error:', error);
      return [];
    }
  }

  /** This agency's linked PR accounts, optionally narrowed by approval / search. */
  async listByAgency(
    agencyId: string,
    options: { approveStatus?: AgencyPrApproveStatus; search?: string } = {},
  ): Promise<AgencyPrEnriched[]> {
    try {
      const conditions = [eq(AgencyPrTable.agencyId, agencyId)];
      if (options.approveStatus) {
        conditions.push(eq(AgencyPrTable.approveStatus, options.approveStatus));
      }
      if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`;
        conditions.push(
          or(
            ilike(UserTable.username, term),
            ilike(UserTable.email, term),
            ilike(UserTable.phoneNum, term),
            ilike(UserProfileTable.fullName, term),
          )!,
        );
      }

      const rows = await db
        .select({
          id: AgencyPrTable.id,
          agencyId: AgencyPrTable.agencyId,
          userId: AgencyPrTable.userId,
          name: sql<string>`coalesce(nullif(trim(${UserProfileTable.fullName}), ''), ${UserTable.username}, 'PR')`,
          nickname: sql<string | null>`nullif(trim(${UserTable.username}), '')`,
          approveStatus: AgencyPrTable.approveStatus,
          tier: AgencyPrTable.tier,
          rejectReason: AgencyPrTable.rejectReason,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
          idNo: UserProfileTable.idNo,
          createdAt: AgencyPrTable.createdAt,
          updatedAt: AgencyPrTable.updatedAt,
          createdBy: AgencyPrTable.createdBy,
          updatedBy: AgencyPrTable.updatedBy,
          profileImage: UserTable.profileImage,
          gender: UserProfileTable.gender,
          race: UserProfileTable.race,
          // The join is already here — omitting this column was the reason an
          // agency saw no languages for a PR who had set them in her own portal.
          languages: UserProfileTable.languages,
          dob: UserProfileTable.dob,
          nationality: UserProfileTable.nationality,
          portfolioPhotos: UserProfileTable.portfolioPhotos,
          comcardImage: UserProfileTable.comcardImage,
          comcardHeightCm: UserProfileTable.comcardHeightCm,
          comcardWeightKg: UserProfileTable.comcardWeightKg,
          comcardBustCm: UserProfileTable.comcardBustCm,
          comcardWaistCm: UserProfileTable.comcardWaistCm,
          comcardHipCm: UserProfileTable.comcardHipCm,
          place: AgencyPrTable.place,
          yearsExp: AgencyPrTable.yearsExp,
          kpiTier: AgencyPrTable.kpiTier,
          payClass: AgencyPrTable.payClass,
        })
        .from(AgencyPrTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, AgencyPrTable.userId))
        .where(and(...conditions))
        .orderBy(UserTable.username);

      // `agency_pr` is unique on (agencyId, userId) — one row per user
      // already, no drifted-duplicate `pr` rows to collapse anymore. `prId`
      // is `userId` restated; `prStatus` has no backing state (see the type).
      return rows.map((row) => ({ ...row, prId: row.userId, prStatus: null }));
    } catch (error) {
      logger.error('[AgencyPrRepository.listByAgency] Error:', error);
      return [];
    }
  }

  /** Narrows the given ids to the ones that are real agencies. */
  async filterExistingAgencyIds(agencyIds: string[]): Promise<string[]> {
    if (agencyIds.length === 0) return [];
    try {
      const rows = await db
        .select({ id: AgencyTable.id })
        .from(AgencyTable)
        .where(inArray(AgencyTable.id, agencyIds));
      return rows.map((row) => row.id);
    } catch (error) {
      logger.error('[AgencyPrRepository.filterExistingAgencyIds] Error:', error);
      return [];
    }
  }

  /** The roster-profile columns an agency grades its own PR on (0089).
   * `userId` is the PR account id (`id === userId` post-cutover — there is no
   * `pr` row / `pr_id` column on agency_pr anymore). */
  async upsertRosterProfile(
    agencyId: string,
    userId: string,
    patch: {
      place?: string;
      yearsExp?: number;
      kpiTier?: string;
      payClass?: string;
    },
    actor: string,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    try {
      await db
        .insert(AgencyPrTable)
        .values({
          agencyId,
          userId,
          approveStatus: 'pending',
          ...patch,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [AgencyPrTable.agencyId, AgencyPrTable.userId],
          // Only the supplied keys — never spread the whole row, or an omitted
          // field would be nulled out. approve_status is deliberately absent:
          // grading a PR must not silently approve or unapprove their join.
          set: { ...patch, updatedAt: new Date(), updatedBy: actor },
        });
    } catch (error) {
      logger.error('[AgencyPrRepository.upsertRosterProfile] Error:', error);
      throw error;
    }
  }

  /** Every agency_pr row for one user account. */
  async listByUser(userId: string): Promise<AgencyPrType[]> {
    try {
      return await db.select().from(AgencyPrTable).where(eq(AgencyPrTable.userId, userId));
    } catch (error) {
      logger.error('[AgencyPrRepository.listByUser] Error:', error);
      return [];
    }
  }

  /** @deprecated Use listByUser — `prId` is `userId` post-cutover, kept as an alias while callers migrate. */
  async listByPr(prId: string): Promise<AgencyPrType[]> {
    return this.listByUser(prId);
  }

  /**
   * Point this user's agency links at exactly `agencyIds`.
   * New links are `pending` — agency must approve.
   */
  async syncLinksForUser(userId: string, agencyIds: string[], actor: string): Promise<void> {
    const wanted = [...new Set(agencyIds)];
    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(AgencyPrTable)
          .where(eq(AgencyPrTable.userId, userId));

        const stale = existing
          .filter((row) => !wanted.includes(row.agencyId))
          .map((row) => row.id);
        if (stale.length > 0) {
          await tx.delete(AgencyPrTable).where(inArray(AgencyPrTable.id, stale));
        }

        const known = new Set(existing.map((row) => row.agencyId));
        const added = wanted.filter((agencyId) => !known.has(agencyId));
        if (added.length > 0) {
          await tx.insert(AgencyPrTable).values(
            added.map((agencyId) => ({
              agencyId,
              userId,
              approveStatus: 'pending' as const,
              createdBy: actor,
              updatedBy: actor,
            })),
          );
        }
      });
    } catch (error) {
      logger.error('[AgencyPrRepository.syncLinksForUser] Error:', error);
      throw error;
    }
  }

  /** @deprecated Use syncLinksForUser — `prId` is `userId` post-cutover. */
  async syncLinksForPr(prId: string, agencyIds: string[], actor: string): Promise<void> {
    return this.syncLinksForUser(prId, agencyIds, actor);
  }

  /** Insert one pending (or approved) membership if missing. */
  async ensureLink(
    userId: string,
    agencyId: string,
    actor: string,
    approveStatus: AgencyPrApproveStatus = 'pending',
  ): Promise<void> {
    try {
      await db
        .insert(AgencyPrTable)
        .values({
          agencyId,
          userId,
          approveStatus,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoNothing();
    } catch (error) {
      logger.error('[AgencyPrRepository.ensureLink] Error:', error);
      throw error;
    }
  }

  /** Insert or refresh membership (owner invite / approve path). */
  async upsertLink(
    userId: string,
    agencyId: string,
    actor: string,
    data: { approveStatus: AgencyPrApproveStatus; tier?: PrTier },
  ): Promise<AgencyPrType> {
    try {
      const [row] = await db
        .insert(AgencyPrTable)
        .values({
          agencyId,
          userId,
          approveStatus: data.approveStatus,
          tier: data.tier ?? 'tier_1',
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [AgencyPrTable.agencyId, AgencyPrTable.userId],
          set: {
            approveStatus: data.approveStatus,
            ...(data.tier ? { tier: data.tier } : {}),
            rejectReason: data.approveStatus === 'approved' ? null : undefined,
            updatedAt: new Date(),
            updatedBy: actor,
          },
        })
        .returning();
      return row;
    } catch (error) {
      logger.error('[AgencyPrRepository.upsertLink] Error:', error);
      throw error;
    }
  }

  async updateMembership(
    agencyId: string,
    userId: string,
    data: { tier?: PrTier; approveStatus?: AgencyPrApproveStatus; rejectReason?: string | null },
    actor: string,
  ): Promise<AgencyPrType | null> {
    try {
      const [row] = await db
        .update(AgencyPrTable)
        .set({
          ...(data.tier ? { tier: data.tier } : {}),
          ...(data.approveStatus ? { approveStatus: data.approveStatus } : {}),
          ...(data.rejectReason !== undefined ? { rejectReason: data.rejectReason } : {}),
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AgencyPrRepository.updateMembership] Error:', error);
      return null;
    }
  }

  async removeLink(agencyId: string, userId: string): Promise<boolean> {
    try {
      const rows = await db
        .delete(AgencyPrTable)
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .returning({ id: AgencyPrTable.id });
      return rows.length > 0;
    } catch (error) {
      logger.error('[AgencyPrRepository.removeLink] Error:', error);
      return false;
    }
  }

  /** Approvals screen — accept / decline a membership request. */
  async setApproveStatus(
    agencyId: string,
    userId: string,
    approveStatus: AgencyPrApproveStatus,
    actor: string,
    rejectReason?: string | null,
  ): Promise<AgencyPrType | null> {
    try {
      const [row] = await db
        .update(AgencyPrTable)
        .set({
          approveStatus,
          rejectReason:
            approveStatus === 'rejected' ? (rejectReason?.trim() || null) : null,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(AgencyPrTable.agencyId, agencyId), eq(AgencyPrTable.userId, userId)))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AgencyPrRepository.setApproveStatus] Error:', error);
      return null;
    }
  }
}
