import { and, eq, exists, ilike, inArray, sql, SQL } from 'drizzle-orm';
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
  portfolioPhotos: UserProfileTable.portfolioPhotos,
  comcardHeightCm: UserProfileTable.comcardHeightCm,
  comcardWeightKg: UserProfileTable.comcardWeightKg,
};

/** Collapses an all-null left-join result (no user, or no profile) to `null`. */
function toProfile(row: PrProfile): PrProfile | null {
  const hasValue = Object.values(row).some((value) => value !== null && value !== undefined);
  return hasValue ? row : null;
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

  /** The PR record linked to a user account — how a signed-in PR resolves its
   * own pr.id server-side (PRs cannot read the /pr list). */
  async getByUserId(userId: string): Promise<PrType | null> {
    try {
      const [pr] = await db
        .select()
        .from(PrTable)
        .where(eq(PrTable.userId, userId))
        .limit(1);
      return pr ?? null;
    } catch (error) {
      logger.error('[PrRepository.getByUserId] Error:', error);
      return null;
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
        .select({ pr: PrTable, profile: profileColumns })
        .from(PrTable)
        .leftJoin(UserTable, eq(UserTable.id, PrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
        .where(eq(PrTable.id, id))
        .limit(1);
      return row ? { ...row.pr, profile: toProfile(row.profile) } : null;
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
        .select({ pr: PrTable, profile: profileColumns })
        .from(PrTable)
        .leftJoin(UserTable, eq(UserTable.id, PrTable.userId))
        .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
        .where(whereClause)
        .orderBy(PrTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const prs = rows.map((row) => ({ ...row.pr, profile: toProfile(row.profile) }));
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
