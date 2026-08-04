import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import {
  AgencyPrTable,
  PrTable,
  type AgencyPrApproveStatus,
  type AgencyPrType,
  type PrStatus,
  type PrTier,
} from '@/features/pr/pr.model';
import { UserTable } from '@/features/user/user.model';
import { logger } from '@/util/logger';

/**
 * PR-account ↔ agency membership (`agency_pr`), keyed by `user_id` (migration 0085).
 */

/** One agency a PR account belongs to. */
export type PrAgencyLink = {
  /** Operational pr row when one exists for this user; null if account-only. */
  prId: string | null;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: AgencyPrApproveStatus;
};

/** A PR on an agency's membership list, with account fields folded in. */
export type AgencyPrEnriched = {
  /** Membership row id — use for approve/reject (not deprecated pr.id). */
  id: string;
  prId: string | null;
  /** Ops-bridge status when a pr row exists. */
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
};

const APPROVE_RANK: Record<string, number> = { approved: 3, pending: 2, rejected: 1 };

export class AgencyPrRepository {
  /** Every agency each of these user accounts is under. */
  async listLinksByUserIds(userIds: string[]): Promise<PrAgencyLink[]> {
    if (userIds.length === 0) return [];

    try {
      const rows = await db
        .select({
          prId: PrTable.id,
          userId: AgencyPrTable.userId,
          agencyId: AgencyPrTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          approveStatus: AgencyPrTable.approveStatus,
        })
        .from(AgencyPrTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyPrTable.agencyId))
        .leftJoin(PrTable, eq(PrTable.userId, AgencyPrTable.userId))
        .where(inArray(AgencyPrTable.userId, userIds))
        .orderBy(AgencyTable.name);

      // One user can still have multiple pr rows — collapse per (user, agency).
      const best = new Map<string, PrAgencyLink>();
      for (const row of rows) {
        const key = `${row.userId}:${row.agencyId}`;
        const seen = best.get(key);
        if (
          !seen ||
          (APPROVE_RANK[row.approveStatus] ?? 0) > (APPROVE_RANK[seen.approveStatus] ?? 0)
        ) {
          best.set(key, row);
        }
      }
      return [...best.values()];
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
            ilike(PrTable.name, term),
            ilike(PrTable.nickname, term),
          )!,
        );
      }

      const rows = await db
        .select({
          id: AgencyPrTable.id,
          prId: PrTable.id,
          prStatus: PrTable.status,
          agencyId: AgencyPrTable.agencyId,
          userId: AgencyPrTable.userId,
          name: sql<string>`coalesce(nullif(trim(${UserProfileTable.fullName}), ''), ${PrTable.name}, ${UserTable.username}, 'PR')`,
          nickname: sql<string | null>`coalesce(nullif(trim(${UserTable.username}), ''), ${PrTable.nickname})`,
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
          dob: UserProfileTable.dob,
          nationality: UserProfileTable.nationality,
          portfolioPhotos: UserProfileTable.portfolioPhotos,
          comcardImage: UserProfileTable.comcardImage,
          comcardHeightCm: UserProfileTable.comcardHeightCm,
          comcardWeightKg: UserProfileTable.comcardWeightKg,
          comcardBustCm: UserProfileTable.comcardBustCm,
          comcardWaistCm: UserProfileTable.comcardWaistCm,
          comcardHipCm: UserProfileTable.comcardHipCm,
        })
        .from(AgencyPrTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, AgencyPrTable.userId))
        .leftJoin(PrTable, eq(PrTable.userId, AgencyPrTable.userId))
        .where(and(...conditions))
        .orderBy(UserTable.username);

      // Collapse multi-pr users to one membership row.
      const best = new Map<string, AgencyPrEnriched>();
      for (const row of rows) {
        const key = row.userId;
        const seen = best.get(key);
        if (
          !seen ||
          (APPROVE_RANK[row.approveStatus] ?? 0) > (APPROVE_RANK[seen.approveStatus] ?? 0)
        ) {
          best.set(key, row);
        }
      }
      return [...best.values()];
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

  /** Every agency_pr row for one user account. */
  async listByUser(userId: string): Promise<AgencyPrType[]> {
    try {
      return await db.select().from(AgencyPrTable).where(eq(AgencyPrTable.userId, userId));
    } catch (error) {
      logger.error('[AgencyPrRepository.listByUser] Error:', error);
      return [];
    }
  }

  /** @deprecated Use listByUser — kept as alias while callers migrate. */
  async listByPr(prId: string): Promise<AgencyPrType[]> {
    try {
      const [pr] = await db
        .select({ userId: PrTable.userId })
        .from(PrTable)
        .where(eq(PrTable.id, prId))
        .limit(1);
      if (!pr?.userId) return [];
      return this.listByUser(pr.userId);
    } catch (error) {
      logger.error('[AgencyPrRepository.listByPr] Error:', error);
      return [];
    }
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

  /** @deprecated Use syncLinksForUser. */
  async syncLinksForPr(prId: string, agencyIds: string[], actor: string): Promise<void> {
    const [pr] = await db
      .select({ userId: PrTable.userId })
      .from(PrTable)
      .where(eq(PrTable.id, prId))
      .limit(1);
    if (!pr?.userId) {
      throw new Error('PR has no linked user account — cannot sync agency_pr');
    }
    return this.syncLinksForUser(pr.userId, agencyIds, actor);
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
