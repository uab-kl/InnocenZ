import { and, asc, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
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
} from './shift-assignment.model';

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
          prName: PrTable.name,
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
        })
        .from(ShiftAssignmentTable)
        .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
        .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
        .where(eq(ShiftAssignmentTable.prId, prId))
        .orderBy(ShiftTable.shiftDate);
      return rows.map((row) => ({
        ...row.assignment,
        shiftDate: row.shiftDate,
        slot: row.slot,
        eventName: row.eventName,
        payPerHour: row.payPerHour,
        outletId: row.outletId,
        outletName: row.outletName,
      }));
    } catch (error) {
      logger.error('[ShiftAssignmentRepository.listForPr] Error:', error);
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
