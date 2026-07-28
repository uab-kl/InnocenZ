import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import {
  AgencyPrTable,
  PrTable,
  type AgencyPrApproveStatus,
  type AgencyPrType,
} from '@/features/pr/pr.model';
import { UserTable } from '@/features/user/user.model';
import { logger } from '@/util/logger';

/**
 * Reads of the PR-to-agency relationship (`agency_pr`).
 *
 * This is the half that used to live on `agency_member` as `sub_role='pr'`.
 * Those rows were removed in migration 0033 — `agency_user` is now only portal
 * operators — so anything asking "which agencies is this PR under" or "who are
 * this agency's PRs" reads through here instead.
 */

/** One agency a PR account belongs to, keyed back to the PR's user account. */
export type PrAgencyLink = {
  prId: string;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: AgencyPrApproveStatus;
};

/** A PR on an agency's roster, with the linked user account folded in. */
export type AgencyPrEnriched = {
  prId: string;
  agencyId: string;
  userId: string | null;
  name: string;
  nickname: string | null;
  approveStatus: AgencyPrApproveStatus;
  username: string | null;
  email: string | null;
  phoneNum: string | null;
};

export class AgencyPrRepository {
  /**
   * Every agency each of these PR *user accounts* is under. Joined through `pr`
   * because agency_pr keys on the PR row, not the account; PRs with no linked
   * account (pr.user_id is nullable) are therefore absent by design.
   */
  async listLinksByUserIds(userIds: string[]): Promise<PrAgencyLink[]> {
    if (userIds.length === 0) return [];

    try {
      const rows = await db
        .select({
          prId: PrTable.id,
          userId: PrTable.userId,
          agencyId: AgencyPrTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          approveStatus: AgencyPrTable.approveStatus,
        })
        .from(AgencyPrTable)
        .innerJoin(PrTable, eq(PrTable.id, AgencyPrTable.prId))
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyPrTable.agencyId))
        .where(inArray(PrTable.userId, userIds))
        .orderBy(AgencyTable.name);

      // userId is non-null on every row: the inArray above filters it.
      return rows as PrAgencyLink[];
    } catch (error) {
      logger.error('[AgencyPrRepository.listLinksByUserIds] Error:', error);
      return [];
    }
  }

  /** This agency's PRs, optionally narrowed by approval state or a name search. */
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
            ilike(PrTable.name, term),
            ilike(PrTable.nickname, term),
            ilike(PrTable.email, term),
            ilike(PrTable.phone, term),
          )!,
        );
      }

      return await db
        .select({
          prId: PrTable.id,
          agencyId: AgencyPrTable.agencyId,
          userId: PrTable.userId,
          name: PrTable.name,
          nickname: PrTable.nickname,
          approveStatus: AgencyPrTable.approveStatus,
          username: UserTable.username,
          email: UserTable.email,
          phoneNum: UserTable.phoneNum,
        })
        .from(AgencyPrTable)
        .innerJoin(PrTable, eq(PrTable.id, AgencyPrTable.prId))
        .leftJoin(UserTable, eq(UserTable.id, PrTable.userId))
        .where(and(...conditions))
        .orderBy(PrTable.name);
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

  /** Every agency_pr row for one PR, whatever its approval state. */
  async listByPr(prId: string): Promise<AgencyPrType[]> {
    try {
      return await db.select().from(AgencyPrTable).where(eq(AgencyPrTable.prId, prId));
    } catch (error) {
      logger.error('[AgencyPrRepository.listByPr] Error:', error);
      return [];
    }
  }

  /**
   * Point this PR's agency links at exactly `agencyIds`.
   *
   * A PR asking to join an agency is a *request*, so new links are written as
   * `pending` and only the agency can approve them — this never grants
   * membership on its own. Unticking drops the link; an already-approved one
   * survives only while it stays selected.
   */
  async syncLinksForPr(prId: string, agencyIds: string[], actor: string): Promise<void> {
    const wanted = [...new Set(agencyIds)];
    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(AgencyPrTable)
          .where(eq(AgencyPrTable.prId, prId));

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
              prId,
              approveStatus: 'pending' as const,
              createdBy: actor,
              updatedBy: actor,
            })),
          );
        }
      });
    } catch (error) {
      logger.error('[AgencyPrRepository.syncLinksForPr] Error:', error);
      throw error;
    }
  }
}
