import { and, asc, eq, exists, ilike, inArray, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { PrTable, PrInsertType, PrType, PrFilter, PrProfile, PrWithProfileType } from './pr.model';

// Comcard / identity columns exposed alongside each `pr` row. They live on the
// linked user account, so the read paths left-join it — that is the same source
// the admin PR screen reads, which keeps both screens showing one truth.
const profileColumns = {
  profileImage: UserTable.profileImage,
  gender: UserProfileTable.gender,
  race: UserProfileTable.race,
  dob: UserProfileTable.dob,
  nationality: UserProfileTable.nationality,
  languages: UserProfileTable.languages,
  portfolioPhotos: UserProfileTable.portfolioPhotos,
  comcardImage: UserProfileTable.comcardImage,
  comcardHeightCm: UserProfileTable.comcardHeightCm,
  comcardWeightKg: UserProfileTable.comcardWeightKg,
};

/** Collapses an all-null left-join result (no user, or no profile) to `null`. */
function toProfile(row: PrProfile): PrProfile | null {
  const hasValue = Object.values(row).some((value) => value !== null && value !== undefined);
  return hasValue ? row : null;
}

/**
 * ONE phone number per person: the account's.
 *
 * `pr.phone` and `user.phone_num` held the same fact in two tables and had
 * already drifted apart — one PR's roster number was not the number their
 * account signs in with, so they could not log in with the number their agency
 * had given them. The owner's call (30 Jul 2026) was that **`user.phone_num`
 * wins**, which is also what the project's own database rule says: one fact
 * lives in one table, reached by FK.
 *
 * `pr.phone` survives for the one case where the account does not exist yet — an
 * agency adds a PR to the roster before that person has signed up, and the
 * number they typed is then the only one there is. Once an account is linked, it
 * is the account that answers.
 *
 * The column itself is NOT dropped yet: the agency PR search and jk's PV export
 * still read it directly, and dropping a column out from under a shared database
 * breaks whoever is running at that moment.
 */
function withAccountPhone<T extends PrType>(pr: T, accountPhone: string | null): T {
  return accountPhone ? { ...pr, phone: accountPhone } : pr;
}

export class PrRepositoryClass {
  async create(
    data: Omit<PrInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<PrType> {
    try {
      const dbClient = tx ?? db;
      const [pr] = await dbClient.insert(PrTable).values(data).returning();
      logger.info('[PrRepository.create] PR created:', pr.id);
      return pr;
    } catch (error) {
      logger.error('[PrRepository.create] Error:', error);
      throw error;
    }
  }

  /**
   * The PR record linked to a user account — how a signed-in PR resolves its
   * own pr.id server-side (PRs cannot read the /pr list).
   *
   * Ordered by `created_at` because one user account CAN hold more than one `pr`
   * row: that is data drift from before `agency_pr` existed (see the note on
   * `AgencyPrTable` — one `pr` row plus many `agency_pr` rows is the intended
   * shape, with `pr.agency_id` as the originating agency). An unordered
   * `LIMIT 1` let Postgres return either row per call, so the same PR could
   * resolve to a different identity between two requests — which read as their
   * own swap request, voucher or shift simply not existing. Oldest row wins, to
   * match "originating agency"; `id` breaks a same-timestamp tie so the order is
   * total.
   *
   * Callers get ONE row, so a PR with drifted duplicates still sees only the
   * agency behind that row. Consolidating those rows is a data change on the
   * shared DB (it has to repoint `shift_assignment`, `payment_voucher`, …), so it
   * is deliberately not done here; this only guarantees the answer stops moving.
   */
  async getByUserId(userId: string): Promise<PrType | null> {
    try {
      const rows = await db
        .select()
        .from(PrTable)
        .where(eq(PrTable.userId, userId))
        .orderBy(asc(PrTable.createdAt), asc(PrTable.id))
        .limit(2);

      if (rows.length > 1) {
        logger.warn(
          `[PrRepository.getByUserId] user ${userId} has multiple pr rows; resolving to the oldest (${rows[0].id}). Rows under any other pr id are invisible to this account.`,
        );
      }
      return rows[0] ?? null;
    } catch (error) {
      logger.error('[PrRepository.getByUserId] Error:', error);
      return null;
    }
  }

  /**
   * Just the ids of an agency's PRs. Enough to scope a query that keys on a PR
   * id without paging the whole roster through `listPaginated`. Fails closed:
   * an error yields an empty list, which callers must treat as "matches
   * nothing" rather than "no filter".
   */
  async listIdsByAgency(agencyId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ id: PrTable.id })
        .from(PrTable)
        .where(eq(PrTable.agencyId, agencyId));
      return rows.map((row) => row.id);
    } catch (error) {
      logger.error('[PrRepository.listIdsByAgency] Error:', error);
      return [];
    }
  }

  async update(
    id: string,
    data: Partial<PrInsertType>,
    tx?: DbTransaction,
  ): Promise<PrType | null> {
    try {
      const dbClient = tx ?? db;
      const [pr] = await dbClient
        .update(PrTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PrTable.id, id))
        .returning();
      // Empty result => row not found (a genuine null); a real DB error re-throws below.
      return pr ?? null;
    } catch (error) {
      logger.error('[PrRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<PrWithProfileType | null> {
    try {
      const [row] = await db
        .select({ pr: PrTable, profile: profileColumns, accountPhone: UserTable.phoneNum })
        .from(PrTable)
        .leftJoin(UserTable, eq(UserTable.id, PrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
        .where(eq(PrTable.id, id))
        .limit(1);
      return row
        ? { ...withAccountPhone(row.pr, row.accountPhone), profile: toProfile(row.profile) }
        : null;
    } catch (error) {
      logger.error('[PrRepository.getById] Error:', error);
      throw error;
    }
  }

  async listPaginated(params: {
    filter?: PrFilter;
    page: number;
    pageSize: number;
  }): Promise<{ prs: PrWithProfileType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(PrTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(PrTable.agencyId, filter.agencyId));
      if (filter?.status) conditions.push(eq(PrTable.status, filter.status));
      if (filter?.tier) conditions.push(eq(PrTable.tier, filter.tier));
      if (filter?.name) conditions.push(ilike(PrTable.name, `%${filter.name}%`));
      // Outlet callers only see PRs actually rostered at one of their venues.
      // An empty array must match nothing, not everything — guard before the join.
      if (filter?.assignedToOutletIds) {
        if (filter.assignedToOutletIds.length === 0) return { prs: [], totalCount: 0 };
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(ShiftAssignmentTable)
              .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
              .where(
                and(
                  eq(ShiftAssignmentTable.prId, PrTable.id),
                  inArray(ShiftTable.outletId, filter.assignedToOutletIds),
                ),
              ),
          ),
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(PrTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const rows = await db
        .select({ pr: PrTable, profile: profileColumns, accountPhone: UserTable.phoneNum })
        .from(PrTable)
        .leftJoin(UserTable, eq(UserTable.id, PrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
        .where(whereClause)
        .orderBy(PrTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const prs = rows.map((row) => ({
        ...withAccountPhone(row.pr, row.accountPhone),
        profile: toProfile(row.profile),
      }));
      return { prs, totalCount };
    } catch (error) {
      logger.error('[PrRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db.delete(PrTable).where(eq(PrTable.id, id)).returning({ id: PrTable.id });
      // No row => not found; a real DB error re-throws below.
      return !!row;
    } catch (error) {
      logger.error('[PrRepository.remove] Error:', error);
      throw error;
    }
  }
}
