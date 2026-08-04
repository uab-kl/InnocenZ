import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import {
  AgencyPrTable,
  PrTable,
  type AgencyPrApproveStatus,
  type AgencyPrType,
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
  prId: string | null;
  agencyId: string;
  userId: string;
  name: string;
  nickname: string | null;
  approveStatus: AgencyPrApproveStatus;
  username: string | null;
  email: string | null;
  phoneNum: string | null;
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
          prId: PrTable.id,
          agencyId: AgencyPrTable.agencyId,
          userId: AgencyPrTable.userId,
          name: sql<string>`coalesce(nullif(trim(${UserProfileTable.fullName}), ''), ${PrTable.name}, ${UserTable.username}, 'PR')`,
          nickname: sql<string | null>`coalesce(nullif(trim(${UserTable.username}), ''), ${PrTable.nickname})`,
          approveStatus: AgencyPrTable.approveStatus,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
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
}
