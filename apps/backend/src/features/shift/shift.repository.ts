import { and, asc, eq, gte, inArray, lte, ne, notInArray, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';
import { logger } from '@/util/logger';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
// The SAME status set the roster and the capacity guard use — a private copy here
// would let "who counts as staffed" drift between the count and the rule. Taken
// from the MODEL, never the repository: repo-to-repo is how a cycle gets closed.
import {
  NON_STAFFING_STATUSES,
  ShiftAssignmentTable,
} from '@/features/shift-assignment/shift-assignment.model';
import { bucketForPrTier } from '@/features/shift-assignment/tier-demand';
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
      // The event cover rides on every shift read (0128): agencies and PRs
      // may not read another org's template list, so the picture has to
      // arrive WITH the shift.
      const [row] = await db
        .select({ shift: ShiftTable, templateCoverImage: ShiftTemplateTable.coverImage })
        .from(ShiftTable)
        .leftJoin(ShiftTemplateTable, eq(ShiftTemplateTable.id, ShiftTable.templateId))
        .where(eq(ShiftTable.id, id))
        .limit(1);
      const shift = row ? { ...row.shift, templateCoverImage: row.templateCoverImage } : undefined;
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

  /**
   * HOW FULL EACH SHIFT ACTUALLY IS, counting every agency.
   *
   * ⚠️ This exists because `GET /shift-assignment` is scoped to the caller's own
   * agency — correctly, since one agency must not read another's roster. But a
   * shift shared through `shift_agency` (0124) is filled BY BOTH, so a client
   * counting the rows it can see reports its own contribution as the occupancy:
   * agency A sees "0/2 · 2 open" on the very shift agency B has already half
   * filled. Both then offer the same seats, and the second one to assign gets a
   * 409 from the capacity guard with no way to have known.
   *
   * The fix is to share the COUNT and not the rows: this returns aggregates only,
   * so nothing here can leak who the other agency sent.
   *
   * Buckets are keyed the way the assign guard keys them (`bucketForPrTier`),
   * because the per-tier quota has the same split-brain problem as the headcount.
   * The tier is read from `agency_pr` joined on BOTH `user_id` and `agency_id` —
   * one person holds a row per agency and their tier can differ between them, so
   * joining on the user alone would price a seat at the wrong agency's grade.
   */
  async countStaffedForShifts(
    shiftIds: string[],
  ): Promise<Map<string, { total: number; byBucket: Record<string, number> }>> {
    const byShift = new Map<string, { total: number; byBucket: Record<string, number> }>();
    if (shiftIds.length === 0) return byShift;
    try {
      const rows = await db
        .select({
          shiftId: ShiftAssignmentTable.shiftId,
          tier: AgencyPrTable.tier,
        })
        .from(ShiftAssignmentTable)
        .leftJoin(
          AgencyPrTable,
          and(
            eq(AgencyPrTable.userId, ShiftAssignmentTable.prId),
            eq(AgencyPrTable.agencyId, ShiftAssignmentTable.agencyId),
          ),
        )
        .where(
          and(
            inArray(ShiftAssignmentTable.shiftId, shiftIds),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        );

      for (const row of rows) {
        const entry = byShift.get(row.shiftId) ?? { total: 0, byBucket: {} };
        entry.total += 1;
        const bucket = bucketForPrTier(row.tier);
        if (bucket) entry.byBucket[bucket] = (entry.byBucket[bucket] ?? 0) + 1;
        byShift.set(row.shiftId, entry);
      }
      return byShift;
    } catch (error) {
      logger.error('[ShiftRepository.countStaffedForShifts] Error:', error);
      // A count that FAILED must not read as "nobody is on it" and invite an
      // overfill. Throwing keeps the caller honest: it omits the field, and every
      // consumer falls back to what it did before rather than to zero.
      throw error;
    }
  }

  /**
   * Is this agency invited to this shift? THE SCOPE CHECK for a single shift.
   *
   * Its own method rather than `listAgencyIdsForShifts([id]).get(id)?.includes()`
   * because that chain reads as a lookup rather than a permission test — and the
   * thing it replaces, `shift.agencyId === scope.agencyId`, is a one-liner. A
   * correct rule has to be as easy to write as the wrong one, or the wrong one
   * comes back.
   *
   * Never compare `shift.agency_id` to the caller. That column is only the
   * ANCHOR (0124) — the first agency the outlet addressed — so on a shift shared
   * between two agencies the check passes for exactly one of them and 404s the
   * other, which looks like a venue's roster vanishing with no error anywhere.
   */
  async isAgencyInvited(shiftId: string, agencyId: string): Promise<boolean> {
    try {
      const [row] = await db
        .select({ shiftId: ShiftAgencyTable.shiftId })
        .from(ShiftAgencyTable)
        .where(
          and(
            eq(ShiftAgencyTable.shiftId, shiftId),
            eq(ShiftAgencyTable.agencyId, agencyId),
          ),
        )
        .limit(1);
      return Boolean(row);
    } catch (error) {
      logger.error('[ShiftRepository.isAgencyInvited] Error:', error);
      // A failed lookup must REFUSE, never wave through — this is a scope check.
      return false;
    }
  }

  /**
   * Which agencies each shift was posted to (0124), keyed by shift id.
   *
   * Anything asking "may this agency see / price / staff this shift" reads THIS.
   * `shift.agency_id` is only the ANCHOR — the first agency the outlet addressed —
   * and scoping by it silently hides a shared shift from every other invited agency,
   * with no error to notice.
   */
  async listAgencyIdsForShifts(shiftIds: string[]): Promise<Map<string, string[]>> {
    const byShift = new Map<string, string[]>();
    if (shiftIds.length === 0) return byShift;
    try {
      const rows = await db
        .select({ shiftId: ShiftAgencyTable.shiftId, agencyId: ShiftAgencyTable.agencyId })
        .from(ShiftAgencyTable)
        .where(inArray(ShiftAgencyTable.shiftId, shiftIds));
      for (const row of rows) {
        byShift.set(row.shiftId, [...(byShift.get(row.shiftId) ?? []), row.agencyId]);
      }
      return byShift;
    } catch (error) {
      logger.error('[ShiftRepository.listAgencyIdsForShifts] Error:', error);
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

      const shiftRows = await db
        .select({ shift: ShiftTable, templateCoverImage: ShiftTemplateTable.coverImage })
        .from(ShiftTable)
        .leftJoin(ShiftTemplateTable, eq(ShiftTemplateTable.id, ShiftTable.templateId))
        .where(whereClause)
        .orderBy(ShiftTable.shiftDate)
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const shifts = shiftRows.map((r) => ({ ...r.shift, templateCoverImage: r.templateCoverImage }));

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
