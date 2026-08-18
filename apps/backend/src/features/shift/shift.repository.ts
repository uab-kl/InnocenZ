import { and, asc, eq, gte, inArray, lte, ne, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import {
  ShiftTable,
  ShiftInsertType,
  ShiftType,
  ShiftFilter,
  ShiftAgencyTable,
  ShiftPayTierTable,
  ShiftPayTier,
} from './shift.model';

// A pay-tier override row as accepted from the controller — the caller supplies
// only the rate fields; shift_id, actor, and timestamps are set by the repo.
export type ShiftPayTierInput = Omit<
  ShiftPayTier,
  'id' | 'shiftId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

export class ShiftRepositoryClass {
  async create(
    data: Omit<ShiftInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<ShiftType> {
    try {
      const dbClient = tx ?? db;
      const [shift] = await dbClient.insert(ShiftTable).values(data).returning();
      logger.info('[ShiftRepository.create] Shift created:', shift.id);
      return shift;
    } catch (error) {
      logger.error('[ShiftRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<ShiftInsertType>,
    tx?: DbTransaction,
  ): Promise<ShiftType | null> {
    try {
      const dbClient = tx ?? db;
      const [shift] = await dbClient
        .update(ShiftTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ShiftTable.id, id))
        .returning();
      return shift ?? null;
    } catch (error) {
      logger.error('[ShiftRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<ShiftType | null> {
    try {
      const [shift] = await db.select().from(ShiftTable).where(eq(ShiftTable.id, id)).limit(1);
      return shift ?? null;
    } catch (error) {
      logger.error('[ShiftRepository.getById] Error:', error);
      throw error;
    }
  }

  /**
   * The outlet's other shifts that could COLLIDE with one on `shiftDate` — that
   * day, plus the day either side. Slim on purpose: only what a refusal has to name.
   *
   * ⚠️ The ±1 day is not padding. A 22:00–04:00 shift on the 17th runs into the
   * 18th, so a new 02:00–06:00 on the 18th genuinely overlaps a row filed under a
   * DIFFERENT `shift_date` — an exact-date read would never compare them, and
   * overnight is the normal shape in this business. `shiftsOverlap` does the real
   * test on a continuous timeline; this only has to get the row into the room.
   *
   * A DRAFT has not been asked for yet and so cannot clash with anything, which is
   * the same call `outletDailyPrUsage` makes. `shift_date` is a plain `date` column
   * (since 0023), so these bounds are plain 'YYYY-MM-DD' comparisons.
   */
  async listByOutletAroundDate(params: {
    outletId: string;
    shiftDate: string;
    excludeShiftId?: string;
  }): Promise<
    { id: string; shiftDate: string; slot: string | null; eventName: string | null }[]
  > {
    try {
      const day = String(params.shiftDate).slice(0, 10);
      // Date.UTC normalises the overflow, so this is correct across month and year
      // ends without a calendar library.
      const dayOffsetBy = (days: number): string => {
        const [y, m, d] = day.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
      };

      const conditions: SQL[] = [
        eq(ShiftTable.outletId, params.outletId),
        gte(ShiftTable.shiftDate, dayOffsetBy(-1)),
        lte(ShiftTable.shiftDate, dayOffsetBy(1)),
        ne(ShiftTable.status, 'draft'),
      ];
      if (params.excludeShiftId) conditions.push(ne(ShiftTable.id, params.excludeShiftId));

      return await db
        .select({
          id: ShiftTable.id,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
        })
        .from(ShiftTable)
        .where(and(...conditions));
    } catch (error) {
      logger.error('[ShiftRepository.listByOutletAroundDate] Error:', error);
      throw error;
    }
  }

  /** The pay-tier override rows an outlet set for one shift, in composer order. */
  async listPayTiersForShift(shiftId: string): Promise<ShiftPayTier[]> {
    try {
      return await db
        .select()
        .from(ShiftPayTierTable)
        .where(eq(ShiftPayTierTable.shiftId, shiftId))
        .orderBy(asc(ShiftPayTierTable.sortOrder));
    } catch (error) {
      logger.error('[ShiftRepository.listPayTiersForShift] Error:', error);
      throw error;
    }
  }

  /**
   * Pay-tier rows for a PAGE of shifts, keyed by shift id.
   *
   * Batched rather than one call per shift: the list endpoint attaches these so
   * the roster and the auto-assign planner can see the tier MIX a shift asked
   * for, and doing that N times per page would put a query per row on the
   * busiest read in the portal.
   */
  async listPayTiersForShifts(shiftIds: string[]): Promise<Map<string, ShiftPayTier[]>> {
    try {
      if (shiftIds.length === 0) return new Map();
      const rows = await db
        .select()
        .from(ShiftPayTierTable)
        .where(inArray(ShiftPayTierTable.shiftId, shiftIds))
        .orderBy(asc(ShiftPayTierTable.sortOrder));
      const byShift = new Map<string, ShiftPayTier[]>();
      for (const row of rows) {
        byShift.set(row.shiftId, [...(byShift.get(row.shiftId) ?? []), row]);
      }
      return byShift;
    } catch (error) {
      logger.error('[ShiftRepository.listPayTiersForShifts] Error:', error);
      throw error;
    }
  }

  /**
   * Replace a shift's pay-tier overrides wholesale (delete-then-insert), mirroring
   * how the outlet workspace replaces its child rows. Passing an empty array
   * clears the overrides so the shift falls back to the outlet workspace defaults.
   */
  async replacePayTiers(
    shiftId: string,
    rows: ShiftPayTierInput[],
    actor: string,
    tx?: DbTransaction,
  ): Promise<void> {
    const dbClient = tx ?? db;
    await dbClient.delete(ShiftPayTierTable).where(eq(ShiftPayTierTable.shiftId, shiftId));
    if (rows.length > 0) {
      await dbClient
        .insert(ShiftPayTierTable)
        .values(rows.map((r) => ({ ...r, shiftId, createdBy: actor, updatedBy: actor })));
    }
  }

  /**
   * Create a shift, its agency fan-out and (optionally) its pay-tier overrides
   * atomically.
   *
   * `agencyIds` is the set of agencies the outlet posted to (0124). It is
   * written in the SAME transaction as the shift on purpose: a shift with no
   * `shift_agency` rows is invisible to every agency, so a partial commit would
   * leave a job nobody can see and nobody can explain. The caller has already
   * checked each id against the outlet's APPROVED links.
   */
  async createWithPayTiers(
    data: Omit<ShiftInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    payTiers: ShiftPayTierInput[] | undefined,
    actor: string,
    agencyIds?: string[],
  ): Promise<ShiftType> {
    try {
      return await db.transaction(async (tx) => {
        const shift = await this.create(data, tx);
        // Always at least the originating agency, so a caller that passes
        // nothing still produces a visible shift rather than an orphan.
        const invited = [...new Set([data.agencyId, ...(agencyIds ?? [])])];
        await tx
          .insert(ShiftAgencyTable)
          .values(
            invited.map((agencyId) => ({
              shiftId: shift.id,
              agencyId,
              createdBy: actor,
              updatedBy: actor,
            })),
          )
          .onConflictDoNothing();
        if (payTiers) await this.replacePayTiers(shift.id, payTiers, actor, tx);
        return shift;
      });
    } catch (error) {
      logger.error('[ShiftRepository.createWithPayTiers] Error:', error);
      throw error;
    }
  }

  /**
   * Update a shift and, when `payTiers` is provided, replace its overrides in the
   * same transaction. `payTiers` undefined leaves existing overrides untouched.
   */
  async updateWithPayTiers(
    id: string,
    data: Partial<ShiftInsertType>,
    payTiers: ShiftPayTierInput[] | undefined,
    actor: string,
  ): Promise<ShiftType | null> {
    try {
      return await db.transaction(async (tx) => {
        const shift = await this.update(id, data, tx);
        if (shift && payTiers) await this.replacePayTiers(id, payTiers, actor, tx);
        return shift;
      });
    } catch (error) {
      logger.error('[ShiftRepository.updateWithPayTiers] Error:', error);
      throw error;
    }
  }

  async listPaginated(params: {
    filter?: ShiftFilter;
    page: number;
    pageSize: number;
  }): Promise<{ shifts: ShiftType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(ShiftTable.id, filter.id));
      // THROUGH `shift_agency`, never `ShiftTable.agencyId` (0124). That column
      // is only the FIRST agency the outlet addressed; an equality filter on it
      // would hide a shared shift from every other invited agency, silently.
      //
      // A subquery rather than a join, so a shift invited to three agencies
      // still yields ONE row — a join would triple it and inflate `totalCount`,
      // which is the paginator's own input.
      if (filter?.agencyId) {
        conditions.push(
          inArray(
            ShiftTable.id,
            db
              .select({ shiftId: ShiftAgencyTable.shiftId })
              .from(ShiftAgencyTable)
              .where(eq(ShiftAgencyTable.agencyId, filter.agencyId)),
          ),
        );
      }
      if (filter?.outletId) conditions.push(eq(ShiftTable.outletId, filter.outletId));
      // An empty array must match nothing, not everything — guard before inArray.
      if (filter?.outletIds) {
        if (filter.outletIds.length === 0) return { shifts: [], totalCount: 0 };
        conditions.push(inArray(ShiftTable.outletId, filter.outletIds));
      }
      if (filter?.status) conditions.push(eq(ShiftTable.status, filter.status));
      if (filter?.eventKind) conditions.push(eq(ShiftTable.eventKind, filter.eventKind));
      // shift_date holds LOCAL midnight as a timestamptz (16:00Z the previous
      // day). Comparing it to a bare 'YYYY-MM-DD' casts to 00:00 UTC and
      // silently drops TODAY's shifts from fromDate=today queries — which is
      // how an on-duty PR vanished from the agency roster + live GPS panel.
      // Compare calendar dates in the venue timezone instead.
      if (filter?.fromDate) {
        conditions.push(
          sql`(${ShiftTable.shiftDate} at time zone 'Asia/Kuala_Lumpur')::date >= ${filter.fromDate}::date`,
        );
      }
      if (filter?.toDate) {
        conditions.push(
          sql`(${ShiftTable.shiftDate} at time zone 'Asia/Kuala_Lumpur')::date <= ${filter.toDate}::date`,
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(ShiftTable)
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const shifts = await db
        .select()
        .from(ShiftTable)
        .where(whereClause)
        .orderBy(ShiftTable.shiftDate)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { shifts, totalCount };
    } catch (error) {
      logger.error('[ShiftRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db.delete(ShiftTable).where(eq(ShiftTable.id, id)).returning({ id: ShiftTable.id });
      return !!row;
    } catch (error) {
      logger.error('[ShiftRepository.remove] Error:', error);
      throw error;
    }
  }
}
