import { and, asc, eq, gte, inArray, lte, notInArray, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { ShiftTable, ShiftPayTierTable } from '@/features/shift/shift.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { PrTable } from '@/features/pr/pr.model';
import {
  OutletDrinkMenuTable,
  OutletTierRateTable,
  OutletWorkspaceTable,
} from '@/features/outlet-workspace/outlet-workspace.model';
import {
  ShiftAssignmentTable,
  ShiftAssignmentInsertType,
  ShiftAssignmentType,
  ShiftAssignmentWithContextType,
  ShiftAssignmentFilter,
  ShiftAssignmentCostFilter,
  ShiftCostPrDayTotals,
  ShiftAssignmentStatus,
} from './shift-assignment.model';

/**
 * Statuses that do not count as staffing cost — cancelled, no-show and
 * leave-approved PRs are not paid (an approved MC/leave excuses the shift).
 * Mirrors mobile `pickActive` (active-shift.tsx) and the canonical
 * `shiftAssignmentStatusValues` in shift-assignment.model.ts.
 */
export const NON_STAFFING_STATUSES = ['cancelled', 'no_show', 'leave_approved'] as const satisfies ReadonlyArray<ShiftAssignmentStatus>;

/**
 * A PR's display name: preferred nickname when set, otherwise legal name.
 * Shared by the assignment-list and cost queries so both show the same label.
 * (Restored after a merge dropped the definition while keeping its usages.)
 */
const prDisplayNameSql = sql<string>`coalesce(nullif(trim(${PrTable.nickname}), ''), ${PrTable.name})`;

/**
 * The rate card resolved for one PR tier at one outlet. Numeric columns stay as
 * their raw string form (matching Drizzle's numeric select), so the mobile app
 * parses them the same way it already parses `payPerHour`/`payAmount`. Any field
 * is null when the outlet left it unset (e.g. commission-only has no wage/OT).
 */
export type ResolvedTierRate = {
  wagePerHour: string | null;
  drinkPct: string; // normal-hour drink commission %
  happyHourDrinkPct: string | null; // happy-hour drink commission %
  tipPct: string;
  otAfterHours: string | null;
  targetSalesRm: string | null;
  happyHourStart: string; // 'HH:MM' or '' when no window set
  happyHourEnd: string;
};

/**
 * A per-shift rate override — the same rate fields as a workspace tier rate but
 * without the happy-hour window (a shift override never moves the window; it
 * always comes from the outlet workspace). Any field null means "not overridden
 * — fall back to the workspace default".
 */
export type ShiftTierOverride = Omit<
  ResolvedTierRate,
  'happyHourStart' | 'happyHourEnd'
>;

/**
 * One drink the PR can self-log at an outlet. `id` carries the menu slug (the
 * mobile app keys quantities on it); `priceRm` stays a numeric string, parsed
 * client-side like the other money fields. Sourced from `outlet_drink_menu`.
 */
export type ResolvedDrinkItem = {
  id: string;
  name: string;
  priceRm: string;
};

/**
 * One released-but-unfilled slot on an upcoming shift: the cancelled /
 * leave-approved assignment plus enough FK-joined shift/outlet context for the
 * agency to backfill it. `staffedCount` counts the shift's remaining staffing
 * assignments (statuses outside NON_STAFFING_STATUSES).
 */
export type BackfillSlot = {
  assignmentId: string;
  prId: string;
  prName: string;
  status: ShiftAssignmentStatus;
  notes: string | null;
  shiftId: string;
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  outletId: string;
  outletName: string | null;
  quantity: number;
  staffedCount: number;
};

/** One ranked replacement option for a released slot. */
export type ReplacementCandidate = {
  prId: string;
  prName: string;
  tier: string;
  /** Completed shifts this PR has worked at the slot's outlet. */
  timesAtOutlet: number;
};

export class ShiftAssignmentRepositoryClass {
  async create(
    data: Omit<ShiftAssignmentInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<ShiftAssignmentType> {
    try {
      const dbClient = tx ?? db;
      const [assignment] = await dbClient.insert(ShiftAssignmentTable).values(data).returning();
      logger.info('[ShiftAssignmentRepository.create] Assignment created:', assignment.id);
      return assignment;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.create] Error:', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<ShiftAssignmentInsertType>,
    tx?: DbTransaction,
  ): Promise<ShiftAssignmentType | null> {
    try {
      const dbClient = tx ?? db;
      const [assignment] = await dbClient
        .update(ShiftAssignmentTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ShiftAssignmentTable.id, id))
        .returning();
      // Empty result => row not found (a genuine null); a real DB error re-throws below.
      return assignment ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.update] Error:', error);
      throw error;
    }
  }

  async getById(id: string): Promise<ShiftAssignmentType | null> {
    try {
      const [assignment] = await db
        .select()
        .from(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.id, id))
        .limit(1);
      return assignment ?? null;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.getById] Error:', error);
      throw error;
    }
  }

  async listByShift(shiftId: string): Promise<ShiftAssignmentType[]> {
    try {
      return await db
        .select()
        .from(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.shiftId, shiftId))
        .orderBy(ShiftAssignmentTable.createdAt);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listByShift] Error:', error);
      throw error;
    }
  }

  /**
   * Every assignment has a shift (FK, not null), so the inner join is lossless.
   * It is what lets an outlet caller be scoped by venue, and it carries the
   * shift/PR context the outlet portal cannot fetch on its own (no `/pr` access).
   */
  async listPaginated(params: {
    filter?: ShiftAssignmentFilter;
    page: number;
    pageSize: number;
  }): Promise<{ assignments: ShiftAssignmentWithContextType[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const conditions: SQL[] = [];
      if (filter?.id) conditions.push(eq(ShiftAssignmentTable.id, filter.id));
      if (filter?.agencyId) conditions.push(eq(ShiftAssignmentTable.agencyId, filter.agencyId));
      if (filter?.shiftId) conditions.push(eq(ShiftAssignmentTable.shiftId, filter.shiftId));
      if (filter?.prId) conditions.push(eq(ShiftAssignmentTable.prId, filter.prId));
      if (filter?.status) conditions.push(eq(ShiftAssignmentTable.status, filter.status));
      // An empty array must match nothing, not everything — guard before inArray.
      if (filter?.outletIds) {
        if (filter.outletIds.length === 0) return { assignments: [], totalCount: 0 };
        conditions.push(inArray(ShiftTable.outletId, filter.outletIds));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` as SQL<number> })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const rows = await db
        .select({
          assignment: ShiftAssignmentTable,
          prName: prDisplayNameSql,
          outletId: ShiftTable.outletId,
          shiftDate: ShiftTable.shiftDate,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(PrTable, eq(ShiftAssignmentTable.prId, PrTable.id))
        .where(whereClause)
        .orderBy(ShiftAssignmentTable.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const assignments = rows.map((row) => ({
        ...row.assignment,
        prName: row.prName,
        outletId: row.outletId,
        shiftDate: row.shiftDate,
      }));

      return { assignments, totalCount };
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listPaginated] Error:', error);
      throw error;
    }
  }

  /**
   * Every shift assignment for one PR, with the shift + outlet context the PR
   * app renders (date, slot/time, event, pay). Outlet name is joined from the
   * FK, never copied onto the row. Chronological by shift date.
   */
  async listForPr(prId: string): Promise<
    Array<
      ShiftAssignmentType & {
        shiftDate: string;
        slot: string | null;
        eventName: string | null;
        payPerHour: string;
        outletId: string;
        outletName: string | null;
        outletAddress: string | null;
      }
    >
  > {
    try {
      const rows = await db
        .select({
          assignment: ShiftAssignmentTable,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
          payPerHour: ShiftTable.payPerHour,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          // Address parts read straight off the FK-joined outlet — never copied
          // onto the assignment. Composed into one display line below.
          outletAddressLine1: OutletTable.addressLine1,
          outletAddressLine2: OutletTable.addressLine2,
          outletPostcode: OutletTable.postcode,
          outletState: OutletTable.state,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(eq(ShiftAssignmentTable.prId, prId))
        .orderBy(ShiftTable.shiftDate);
      return rows.map((row) => {
        // "50000 Kuala Lumpur" — postcode + state read as one piece.
        const cityLine = [row.outletPostcode, row.outletState]
          .map((s) => s?.trim())
          .filter(Boolean)
          .join(' ');
        const outletAddress =
          [row.outletAddressLine1, row.outletAddressLine2, cityLine]
            .map((s) => s?.trim())
            .filter(Boolean)
            .join(', ') || null;
        return {
          ...row.assignment,
          shiftDate: row.shiftDate,
          slot: row.slot,
          eventName: row.eventName,
          payPerHour: row.payPerHour,
          outletId: row.outletId,
          outletName: row.outletName,
          outletAddress,
        };
      });
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listForPr] Error:', error);
      throw error;
    }
  }

  /**
   * Upcoming shift slots that lost their PR (cancelled or approved MC/leave)
   * and are still short-staffed — the agency's backfill worklist. Staffing is
   * recounted per shift so a slot drops off as soon as a replacement is
   * assigned. Shift/outlet/PR context is FK-joined, never copied.
   */
  async listBackfillSlots(params: {
    fromDate: string;
    agencyId?: string;
  }): Promise<BackfillSlot[]> {
    try {
      const conditions: SQL[] = [
        inArray(ShiftAssignmentTable.status, ['cancelled', 'leave_approved']),
        gte(ShiftTable.shiftDate, params.fromDate),
      ];
      if (params.agencyId) {
        conditions.push(eq(ShiftAssignmentTable.agencyId, params.agencyId));
      }
      const released = await db
        .select({
          assignmentId: ShiftAssignmentTable.id,
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          status: ShiftAssignmentTable.status,
          notes: ShiftAssignmentTable.notes,
          shiftId: ShiftTable.id,
          shiftDate: ShiftTable.shiftDate,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          quantity: ShiftTable.quantity,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .innerJoin(PrTable, eq(ShiftAssignmentTable.prId, PrTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(and(...conditions))
        .orderBy(asc(ShiftTable.shiftDate));
      if (released.length === 0) return [];

      const shiftIds = [...new Set(released.map((r) => r.shiftId))];
      const staffedRows = await db
        .select({
          shiftId: ShiftAssignmentTable.shiftId,
          staffed: sql<number>`count(*)::int`,
        })
        .from(ShiftAssignmentTable)
        .where(
          and(
            inArray(ShiftAssignmentTable.shiftId, shiftIds),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        )
        .groupBy(ShiftAssignmentTable.shiftId);
      const staffedByShift = new Map(staffedRows.map((r) => [r.shiftId, r.staffed]));

      return released
        .map((r) => ({ ...r, staffedCount: staffedByShift.get(r.shiftId) ?? 0 }))
        .filter((r) => r.staffedCount < r.quantity);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listBackfillSlots] Error:', error);
      throw error;
    }
  }

  /**
   * Ranked replacement PRs for a released slot: the agency's active PRs with no
   * staffing assignment on that date (an existing booking — including a pending
   * leave — makes a PR busy). "Nearest" without geodata = the released PR's
   * tier first (rate parity with what Post Job budgeted), then how often the
   * candidate has completed shifts at this outlet, then name.
   */
  async listReplacementCandidates(params: {
    agencyId: string;
    shiftDate: string;
    outletId: string;
    excludePrIds: string[];
    preferTier?: string;
  }): Promise<ReplacementCandidate[]> {
    try {
      const busyRows = await db
        .select({ prId: ShiftAssignmentTable.prId })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftTable.shiftDate, params.shiftDate),
            notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
          ),
        );
      const unavailable = new Set([
        ...busyRows.map((r) => r.prId),
        ...params.excludePrIds,
      ]);

      const prs = await db
        .select({
          prId: PrTable.id,
          prName: prDisplayNameSql,
          tier: PrTable.tier,
        })
        .from(PrTable)
        .where(and(eq(PrTable.agencyId, params.agencyId), eq(PrTable.status, 'active')))
        .orderBy(asc(PrTable.name));
      const free = prs.filter((p) => !unavailable.has(p.prId));
      if (free.length === 0) return [];

      // Venue familiarity: completed shifts this candidate worked at the outlet.
      const experienceRows = await db
        .select({
          prId: ShiftAssignmentTable.prId,
          times: sql<number>`count(*)::int`,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftTable.outletId, params.outletId),
            eq(ShiftAssignmentTable.status, 'completed'),
            inArray(ShiftAssignmentTable.prId, free.map((p) => p.prId)),
          ),
        )
        .groupBy(ShiftAssignmentTable.prId);
      const timesByPr = new Map(experienceRows.map((r) => [r.prId, r.times]));

      return free
        .map((p) => ({ ...p, timesAtOutlet: timesByPr.get(p.prId) ?? 0 }))
        .sort(
          (a, b) =>
            Number(b.tier === params.preferTier) - Number(a.tier === params.preferTier) ||
            b.timesAtOutlet - a.timesAtOutlet ||
            a.prName.localeCompare(b.prName),
        );
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listReplacementCandidates] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the pay/commission rate card, per outlet, for one PR tier. Joins the
   * outlet's workspace to its tier-rate row: a ranked tier matches on the label
   * (`Tier I`..`Servant`); commission-only matches the single `kind` row (no
   * label). The happy-hour window comes from the workspace parent. Outlets with
   * no workspace, or no matching tier row, simply don't appear in the map — the
   * caller treats a miss as "rate not configured". Rates are read via FK join,
   * never duplicated onto the assignment.
   */
  async resolveTierRatesForOutlets(params: {
    outletIds: string[];
    tierLabel: string | null;
    commissionOnly: boolean;
  }): Promise<Map<string, ResolvedTierRate>> {
    const result = new Map<string, ResolvedTierRate>();
    const { outletIds, tierLabel, commissionOnly } = params;
    // Nothing to resolve: no outlets, or a ranked tier with no label to match.
    if (outletIds.length === 0) return result;
    if (!commissionOnly && !tierLabel) return result;
    try {
      const uniqueOutletIds = [...new Set(outletIds)];
      const tierMatch = commissionOnly
        ? eq(OutletTierRateTable.kind, 'commission_only')
        : and(
            eq(OutletTierRateTable.kind, 'tier'),
            eq(OutletTierRateTable.tier, tierLabel!),
          );
      const rows = await db
        .select({
          outletId: OutletWorkspaceTable.outletId,
          happyHourStart: OutletWorkspaceTable.happyHourStart,
          happyHourEnd: OutletWorkspaceTable.happyHourEnd,
          wagePerHour: OutletTierRateTable.wagePerHour,
          drinkPct: OutletTierRateTable.drinkPct,
          happyHourDrinkPct: OutletTierRateTable.happyHourDrinkPct,
          tipPct: OutletTierRateTable.tipPct,
          otAfterHours: OutletTierRateTable.otAfterHours,
          targetSalesRm: OutletTierRateTable.targetSalesRm,
        })
        .from(OutletWorkspaceTable)
        .innerJoin(
          OutletTierRateTable,
          and(eq(OutletTierRateTable.workspaceId, OutletWorkspaceTable.id), tierMatch),
        )
        .where(inArray(OutletWorkspaceTable.outletId, uniqueOutletIds));
      for (const row of rows) {
        result.set(row.outletId, {
          wagePerHour: row.wagePerHour,
          drinkPct: row.drinkPct,
          happyHourDrinkPct: row.happyHourDrinkPct,
          tipPct: row.tipPct,
          otAfterHours: row.otAfterHours,
          targetSalesRm: row.targetSalesRm,
          happyHourStart: row.happyHourStart,
          happyHourEnd: row.happyHourEnd,
        });
      }
      return result;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.resolveTierRatesForOutlets] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the per-shift pay-tier OVERRIDE, per shift, for one PR tier. Same
   * tier-matching as the workspace resolver but keyed on `shift_pay_tier` rows an
   * outlet set at post time. A shift with no override row for the tier simply
   * doesn't appear — the caller then uses the outlet workspace default.
   */
  async resolveShiftTierOverrides(params: {
    shiftIds: string[];
    tierLabel: string | null;
    commissionOnly: boolean;
  }): Promise<Map<string, ShiftTierOverride>> {
    const result = new Map<string, ShiftTierOverride>();
    const { shiftIds, tierLabel, commissionOnly } = params;
    if (shiftIds.length === 0) return result;
    if (!commissionOnly && !tierLabel) return result;
    try {
      const uniqueShiftIds = [...new Set(shiftIds)];
      const tierMatch = commissionOnly
        ? eq(ShiftPayTierTable.kind, 'commission_only')
        : and(
            eq(ShiftPayTierTable.kind, 'tier'),
            eq(ShiftPayTierTable.tier, tierLabel!),
          );
      const rows = await db
        .select({
          shiftId: ShiftPayTierTable.shiftId,
          wagePerHour: ShiftPayTierTable.wagePerHour,
          drinkPct: ShiftPayTierTable.drinkPct,
          happyHourDrinkPct: ShiftPayTierTable.happyHourDrinkPct,
          tipPct: ShiftPayTierTable.tipPct,
          otAfterHours: ShiftPayTierTable.otAfterHours,
          targetSalesRm: ShiftPayTierTable.targetSalesRm,
        })
        .from(ShiftPayTierTable)
        .where(and(inArray(ShiftPayTierTable.shiftId, uniqueShiftIds), tierMatch));
      for (const row of rows) {
        result.set(row.shiftId, {
          wagePerHour: row.wagePerHour,
          drinkPct: row.drinkPct,
          happyHourDrinkPct: row.happyHourDrinkPct,
          tipPct: row.tipPct,
          otAfterHours: row.otAfterHours,
          targetSalesRm: row.targetSalesRm,
        });
      }
      return result;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.resolveShiftTierOverrides] Error:', error);
      throw error;
    }
  }

  /**
   * Resolve the drink menu, per outlet, from each outlet's workspace. Joins the
   * outlet's workspace to its `outlet_drink_menu` rows (FK), ordered by the
   * outlet's own sort order. Outlets with no workspace, or an empty menu, simply
   * don't appear in the map — the caller renders no menu for them. The menu is
   * read via FK join, never duplicated onto the assignment.
   */
  async resolveDrinkMenusForOutlets(
    outletIds: string[],
  ): Promise<Map<string, ResolvedDrinkItem[]>> {
    const result = new Map<string, ResolvedDrinkItem[]>();
    if (outletIds.length === 0) return result;
    try {
      const uniqueOutletIds = [...new Set(outletIds)];
      const rows = await db
        .select({
          outletId: OutletWorkspaceTable.outletId,
          slug: OutletDrinkMenuTable.slug,
          name: OutletDrinkMenuTable.name,
          priceRm: OutletDrinkMenuTable.priceRm,
        })
        .from(OutletWorkspaceTable)
        .innerJoin(
          OutletDrinkMenuTable,
          eq(OutletDrinkMenuTable.workspaceId, OutletWorkspaceTable.id),
        )
        .where(inArray(OutletWorkspaceTable.outletId, uniqueOutletIds))
        .orderBy(asc(OutletDrinkMenuTable.sortOrder));
      for (const row of rows) {
        const list = result.get(row.outletId) ?? [];
        list.push({ id: row.slug, name: row.name, priceRm: row.priceRm });
        result.set(row.outletId, list);
      }
      return result;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.resolveDrinkMenusForOutlets] Error:', error);
      throw error;
    }
  }

  /**
   * Completed assignments for an agency whose shift falls in [fromDate, toDate],
   * joined to the shift for its date/outlet/pay context. This is the query the
   * weekly PV-generation job groups by PR to build voucher lines.
   */
  async listCompletedForAgencyWeek(params: {
    agencyId: string;
    fromDate: string;
    toDate: string;
  }): Promise<
    Array<{
      assignment: ShiftAssignmentType;
      shiftDate: string;
      outletId: string;
      outletName: string | null;
      slot: string | null;
      eventName: string | null;
    }>
  > {
    try {
      const { agencyId, fromDate, toDate } = params;
      const rows = await db
        .select({
          assignment: ShiftAssignmentTable,
          shiftDate: ShiftTable.shiftDate,
          outletId: ShiftTable.outletId,
          outletName: OutletTable.name,
          slot: ShiftTable.slot,
          eventName: ShiftTable.eventName,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.agencyId, agencyId),
            eq(ShiftAssignmentTable.status, 'completed'),
            gte(ShiftTable.shiftDate, fromDate),
            lte(ShiftTable.shiftDate, toDate),
          ),
        )
        .orderBy(ShiftTable.shiftDate);
      return rows;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listCompletedForAgencyWeek] Error:', error);
      throw error;
    }
  }

  /** Distinct agency IDs that have any completed assignment in [fromDate, toDate]. */
  async listAgencyIdsWithCompletedInRange(fromDate: string, toDate: string): Promise<string[]> {
    try {
      const rows = await db
        .selectDistinct({ agencyId: ShiftAssignmentTable.agencyId })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .where(
          and(
            eq(ShiftAssignmentTable.status, 'completed'),
            gte(ShiftTable.shiftDate, fromDate),
            lte(ShiftTable.shiftDate, toDate),
          ),
        );
      return rows.map((r) => r.agencyId);
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listAgencyIdsWithCompletedInRange] Error:', error);
      throw error;
    }
  }

  /**
   * Shared WHERE for the report cost aggregates: exclude non-staffing statuses,
   * then pin to the caller's org (agency or a set of venues, via the joined
   * shift) and the shift-date window. Empty `outletIds` is guarded by the caller.
   */
  private buildCostConditions(filter?: ShiftAssignmentCostFilter): SQL | undefined {
    const conditions: SQL[] = [
      notInArray(ShiftAssignmentTable.status, [...NON_STAFFING_STATUSES]),
    ];
    if (filter?.agencyId) conditions.push(eq(ShiftAssignmentTable.agencyId, filter.agencyId));
    if (filter?.outletId) conditions.push(eq(ShiftTable.outletId, filter.outletId));
    if (filter?.outletIds) conditions.push(inArray(ShiftTable.outletId, filter.outletIds));
    if (filter?.fromDate) conditions.push(gte(ShiftTable.shiftDate, filter.fromDate));
    if (filter?.toDate) conditions.push(lte(ShiftTable.shiftDate, filter.toDate));
    return and(...conditions);
  }

  /**
   * Manpower cost grouped by (PR, shift date) — the cost side of the report.
   * Aggregating server-side removes the old client-side 100-row assignment cap
   * that under-counted cost (and so overstated margin); the (PR × day) grain
   * lets the client slice any date range and roll up both P&L and top-PRs.
   */
  async reportCostByPrDay(filter?: ShiftAssignmentCostFilter): Promise<ShiftCostPrDayTotals[]> {
    try {
      if (filter?.outletIds && filter.outletIds.length === 0) return [];
      const rows = await db
        .select({
          prId: ShiftAssignmentTable.prId,
          prName: prDisplayNameSql,
          soldOn: ShiftTable.shiftDate,
          cost: sql<number>`coalesce(sum(${ShiftAssignmentTable.payAmount}), 0)::float8`,
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(PrTable, eq(ShiftAssignmentTable.prId, PrTable.id))
        .where(this.buildCostConditions(filter))
        .groupBy(
          ShiftAssignmentTable.prId,
          PrTable.nickname,
          PrTable.name,
          ShiftTable.shiftDate,
        )
        .orderBy(asc(ShiftTable.shiftDate));
      return rows.map((r) => ({
        prId: r.prId,
        prName: r.prName,
        soldOn: r.soldOn,
        cost: Number(r.cost),
      }));
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.reportCostByPrDay] Error:', error);
      return [];
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const [row] = await db
        .delete(ShiftAssignmentTable)
        .where(eq(ShiftAssignmentTable.id, id))
        .returning({ id: ShiftAssignmentTable.id });
      // No row => not found; a real DB error re-throws below.
      return !!row;
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.remove] Error:', error);
      throw error;
    }
  }
}
