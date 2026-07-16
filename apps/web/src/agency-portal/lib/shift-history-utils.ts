/** Shift history types + sort/merge helpers (no portal imports — avoids circular deps). */

import {
  addDaysToIso,
  getLiveTodayIso,
  getPayrollWeekSundayIso,
} from '@agency-portal/lib/demo-clock';

/** Fallback menu unit price when drinkSalesRm is missing (Workspace typical ~RM150). */
export const SHIFT_HISTORY_FALLBACK_PER_DRINK_RM = 150;

export interface ShiftHistoryRow {
  id: string;
  prName: string;
  prId: string;
  outlet: string;
  agencyName: string;
  dateDisplay: string;
  dateIso: string;
  /** PR take-home — wages + OT + commissions (Workspace rates). */
  totalPayout: number;
  /** Drink units sold (kept for inventory / reports). */
  totalDrinks: number;
  /** Full tip sales RM logged for the outlet (not tip-commission %). */
  totalTips: number;
  /** Full drink sales RM for the outlet (menu prices, not PR drink commission). */
  drinkSalesRm?: number;
  /** VIP / table units logged on shift */
  totalTables?: number;
  /** Sealed payout parts — wages / OT / commissions (Workspace snapshot). */
  wagesRm?: number;
  otRm?: number;
  drinkCommissionRm?: number;
  tipCommissionRm?: number;
  tableCommissionRm?: number;
  durationHours: number;
}

/**
 * Scope shift history to the agency that assigned each shift. Rows are tagged with
 * `agencyName` (the operating agency that placed the PR on that night), so a Delta
 * portal never sees Atlas-assigned rows — even for a PR that is a member of both.
 */
export function scopeShiftHistoryToAgencyName(
  rows: ShiftHistoryRow[],
  agencyName: string,
): ShiftHistoryRow[] {
  return (rows ?? []).filter((row) => row.agencyName === agencyName);
}

/** Only shifts on or before today — future nights are not sealed history yet */
export function filterShiftHistoryThroughToday(
  rows: ShiftHistoryRow[],
  todayIso = getLiveTodayIso(),
): ShiftHistoryRow[] {
  return (rows ?? []).filter((row) => row.dateIso <= todayIso);
}

/** Payroll-synced row — amounts match agency demo PV line items (`ap-shift-…`) */
export function isPayrollSyncedShiftHistoryRow(row: ShiftHistoryRow): boolean {
  return row.id.startsWith('ap-shift-');
}

/** Real checkout row — not Velvet demo seed (`vh-…`) */
export function isCheckoutShiftHistoryRow(row: ShiftHistoryRow): boolean {
  return (
    row.id.startsWith('h') &&
    !row.id.startsWith('vh-') &&
    !isPayrollSyncedShiftHistoryRow(row)
  );
}

export function isDateInCurrentPayrollWeek(
  dateIso: string,
  todayIso = getLiveTodayIso(),
): boolean {
  const weekSun = getPayrollWeekSundayIso(todayIso);
  const weekEnd = addDaysToIso(weekSun, 6);
  return dateIso >= weekSun && dateIso <= weekEnd;
}

export function shiftHistorySlotKey(row: ShiftHistoryRow): string {
  return `${row.prId}|${row.dateIso}|${row.outlet.trim().toLowerCase()}`;
}

function shiftHistoryRowPriority(row: ShiftHistoryRow): number {
  if (isPayrollSyncedShiftHistoryRow(row)) return 3;
  if (isCheckoutShiftHistoryRow(row)) return 2;
  if (row.id.startsWith('vh-')) return 1;
  return 0;
}

/** One card per PR × date × outlet — prefer live checkout over demo seed */
export function dedupeShiftHistorySlots(
  rows: ShiftHistoryRow[],
): ShiftHistoryRow[] {
  const bySlot = new Map<string, ShiftHistoryRow>();
  for (const row of rows) {
    const key = shiftHistorySlotKey(row);
    const existing = bySlot.get(key);
    if (
      !existing ||
      shiftHistoryRowPriority(row) > shiftHistoryRowPriority(existing)
    ) {
      bySlot.set(key, row);
    }
  }
  return sortShiftHistoryDesc([...bySlot.values()]);
}

/**
 * History tab display — no future nights; current payroll week is checkout-only;
 * prior weeks keep demo examples (deduped).
 */
export function prepareShiftHistoryForDisplay(
  rows: ShiftHistoryRow[],
  todayIso = getLiveTodayIso(),
): ShiftHistoryRow[] {
  const throughToday = filterShiftHistoryThroughToday(rows, todayIso);
  const scoped = throughToday.filter((row) => {
    if (isDateInCurrentPayrollWeek(row.dateIso, todayIso)) {
      return (
        isCheckoutShiftHistoryRow(row) || isPayrollSyncedShiftHistoryRow(row)
      );
    }
    return true;
  });
  return dedupeShiftHistorySlots(scoped);
}

/** Newest shift nights first; same-day rows sorted by PR name. */
export function compareShiftHistoryDesc(
  a: ShiftHistoryRow,
  b: ShiftHistoryRow,
): number {
  const byDate = (b.dateIso ?? '').localeCompare(a.dateIso ?? '');
  if (byDate !== 0) return byDate;
  return (a.prName ?? '').localeCompare(b.prName ?? '');
}

export function sortShiftHistoryDesc(
  rows: ShiftHistoryRow[],
): ShiftHistoryRow[] {
  return [...(rows ?? [])].sort(compareShiftHistoryDesc);
}

/** Append rows without removing existing history (deduped by id). */
export function mergeShiftHistory(
  existing: ShiftHistoryRow[] | undefined,
  incoming: ShiftHistoryRow[] | undefined,
): ShiftHistoryRow[] {
  const byId = new Map<string, ShiftHistoryRow>();
  for (const row of existing ?? []) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of incoming ?? []) {
    if (row?.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return dedupeShiftHistorySlots(sortShiftHistoryDesc([...byId.values()]));
}

export type ShiftHistoryVenueRollup = {
  venue: string;
  shiftCount: number;
  totalPayout: number;
  totalDrinks: number;
  totalTips: number;
  drinkSalesRm: number;
  totalReceived: number;
  totalTables: number;
  shifts: ShiftHistoryRow[];
};

/** Group a PR's shift rows by outlet (agency) or agency name (outlet portal). */
export function aggregateShiftHistoryByVenue(
  rows: ShiftHistoryRow[],
  portal: 'agency' | 'outlet',
): ShiftHistoryVenueRollup[] {
  const venueKey = portal === 'agency' ? 'outlet' : 'agencyName';
  const map = new Map<string, ShiftHistoryVenueRollup>();

  for (const row of rows) {
    const venue = row[venueKey];
    const cur =
      map.get(venue) ??
      ({
        venue,
        shiftCount: 0,
        totalPayout: 0,
        totalDrinks: 0,
        totalTips: 0,
        drinkSalesRm: 0,
        totalReceived: 0,
        totalTables: 0,
        shifts: [],
      } satisfies ShiftHistoryVenueRollup);

    const drinkSales =
      typeof row.drinkSalesRm === 'number' && Number.isFinite(row.drinkSalesRm)
        ? row.drinkSalesRm
        : row.totalDrinks * SHIFT_HISTORY_FALLBACK_PER_DRINK_RM;
    const received = drinkSales + row.totalTips;

    cur.shiftCount += 1;
    cur.totalPayout += row.totalPayout;
    cur.totalDrinks += row.totalDrinks;
    cur.totalTips += row.totalTips;
    cur.drinkSalesRm += drinkSales;
    cur.totalReceived += received;
    cur.totalTables += row.totalTables ?? 0;
    cur.shifts.push(row);
    map.set(venue, cur);
  }

  return [...map.values()].sort((a, b) => b.totalPayout - a.totalPayout);
}

export function sumShiftHistoryVenueRollups(
  rollups: ShiftHistoryVenueRollup[],
) {
  return rollups.reduce(
    (acc, r) => ({
      shiftCount: acc.shiftCount + r.shiftCount,
      totalPayout: acc.totalPayout + r.totalPayout,
      totalDrinks: acc.totalDrinks + r.totalDrinks,
      totalTips: acc.totalTips + r.totalTips,
      drinkSalesRm: acc.drinkSalesRm + r.drinkSalesRm,
      totalReceived: acc.totalReceived + r.totalReceived,
      totalTables: acc.totalTables + r.totalTables,
    }),
    {
      shiftCount: 0,
      totalPayout: 0,
      totalDrinks: 0,
      totalTips: 0,
      drinkSalesRm: 0,
      totalReceived: 0,
      totalTables: 0,
    },
  );
}

export type ShiftHistoryPrRollup = {
  prId: string;
  prName: string;
  shiftCount: number;
  venues: string[];
  latestDateIso: string;
  latestDateDisplay: string;
  totalPayout: number;
  totalDrinks: number;
  totalTips: number;
  drinkSalesRm: number;
  totalReceived: number;
  totalTables: number;
};

/** One card per PR — totals across all filtered shift rows for that PR. */
export function aggregateShiftHistoryByPr(
  rows: ShiftHistoryRow[],
  portal: 'agency' | 'outlet',
): ShiftHistoryPrRollup[] {
  const venueKey = portal === 'agency' ? 'outlet' : 'agencyName';
  const map = new Map<
    string,
    ShiftHistoryPrRollup & { latestDateIso: string; venueSet: Set<string> }
  >();

  for (const row of rows) {
    let cur = map.get(row.prId);
    if (!cur) {
      cur = {
        prId: row.prId,
        prName: row.prName,
        shiftCount: 0,
        venues: [],
        venueSet: new Set(),
        latestDateIso: row.dateIso,
        latestDateDisplay: row.dateDisplay,
        totalPayout: 0,
        totalDrinks: 0,
        totalTips: 0,
        drinkSalesRm: 0,
        totalReceived: 0,
        totalTables: 0,
      };
      map.set(row.prId, cur);
    }
    const drinkSales =
      typeof row.drinkSalesRm === 'number' && Number.isFinite(row.drinkSalesRm)
        ? row.drinkSalesRm
        : row.totalDrinks * SHIFT_HISTORY_FALLBACK_PER_DRINK_RM;
    const received = drinkSales + row.totalTips;

    cur.shiftCount += 1;
    cur.totalPayout += row.totalPayout;
    cur.totalDrinks += row.totalDrinks;
    cur.totalTips += row.totalTips;
    cur.drinkSalesRm += drinkSales;
    cur.totalReceived += received;
    cur.totalTables += row.totalTables ?? 0;
    cur.venueSet.add(row[venueKey]);
    if (row.dateIso > cur.latestDateIso) {
      cur.latestDateIso = row.dateIso;
      cur.latestDateDisplay = row.dateDisplay;
    }
  }

  const rollups = [...map.values()].map(({ venueSet, ...rollup }) => ({
    ...rollup,
    venues: [...venueSet].sort(),
  }));

  if (portal === 'outlet') {
    return rollups.sort((a, b) =>
      a.prName.localeCompare(b.prName, undefined, { sensitivity: 'base' }),
    );
  }

  return rollups.sort(
    (a, b) =>
      b.latestDateIso.localeCompare(a.latestDateIso) ||
      a.prName.localeCompare(b.prName, undefined, { sensitivity: 'base' }),
  );
}
