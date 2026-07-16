/**
 * Cross-portal sync — single source of truth helpers for Agency, PR, and Outlet.
 */

import type {
  AgencyReconciliationDay,
  AgencyRosterSlot,
  LiveWorkforceEntry,
  OutletCommissionRule,
  OutletPrTier,
  OutletTierRateSettings,
} from '@agency-portal/lib/agency-demo';
import {
  calcShiftPayout,
  DEFAULT_AGENCY_OWNER,
  OUTLET_COMMISSION_RULES,
  resolveRosterPrName,
} from '@agency-portal/lib/agency-demo';
import {
  findOutletShiftForRosterSlot,
  outletShiftDemandSupplied,
  shiftHoursFromLabel,
} from '@agency-portal/lib/outlet-demo';
import type { HistRow, PrPaymentVoucher } from '@agency-portal/lib/pr-demo';
import { formatPrDisplayName } from '@agency-portal/lib/pr-demo';
import { getPayrollWeekSundayIso } from '@agency-portal/lib/demo-clock';
import {
  deriveShiftHistoryStatus,
  histRowsFromInboxPv,
  isPayrollWeekFromInboxPv,
  isPayrollWeekHiddenInHistory,
  isPrPaymentInboxPv,
  isShiftHiddenInHistory,
  pvForPayrollDate,
} from '@agency-portal/lib/pr-payment-history';
import { shiftRowIncomeBreakdown } from '@agency-portal/lib/pr-weekly-payment';
import {
  filterShiftHistoryThroughToday,
  prepareShiftHistoryForDisplay,
  sortShiftHistoryDesc,
  type ShiftHistoryRow,
} from '@agency-portal/lib/shift-history-utils';
import type { ShiftRequest } from '@agency-portal/lib/store';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import { addDaysToIso } from '@agency-portal/lib/demo-clock';
import { resolveOutletShiftDateIso } from '@agency-portal/lib/agency-outlet-shifts';
import type { ShiftApplicant } from '@agency-portal/lib/outlet-demo';
import { DEFAULT_PR_AGENCY_NAME } from '@agency-portal/lib/pr-demo';

/** Canonical outlet for the demo outlet portal (Velvet 23) */
export const DEFAULT_OUTLET_CANONICAL = 'Velvet 23';

const OUTLET_ALIASES: Record<string, string> = {
  'Velvet Room KL': 'Velvet 23',
  'Velvet 23': 'Velvet 23',
};

export function canonicalOutlet(name: string): string {
  return OUTLET_ALIASES[name] ?? name;
}

export function outletMatches(a: string, b: string): boolean {
  return canonicalOutlet(a) === canonicalOutlet(b);
}

export type RosterPayoutEstimateOpts = {
  trainingLevel?: string;
  rules?: OutletCommissionRule[];
  perDrinkRm?: number;
  shiftTierRates?: Record<OutletPrTier, OutletTierRateSettings>;
};

/** Estimated roster payout — wages & commission from PR training tier + live floor metrics */
export function estimateRosterSlotPayout(
  slot: AgencyRosterSlot,
  opts: RosterPayoutEstimateOpts = {},
): number {
  const rules = opts.rules ?? OUTLET_COMMISSION_RULES;
  const perDrinkRm = opts.perDrinkRm ?? 12;
  const hours = shiftHoursFromLabel(slot.shift);
  const drinkUnits = slot.floorDrinks ?? 0;
  return calcShiftPayout(
    {
      outlet: slot.outlet,
      hoursWorked: hours,
      drinks: drinkUnits,
      drinkSales: drinkUnits * perDrinkRm,
      tips: slot.floorTips ?? 0,
      tableSales: 0,
      prTier: opts.trainingLevel,
      shiftTierRates: opts.shiftTierRates,
    },
    rules,
  ).total;
}

export function estimateRosterSlotPayoutForPr(
  slot: AgencyRosterSlot,
  agencyPRs: { id: string; trainingLevel?: string }[] | undefined,
  rules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
  perDrinkRm = 12,
  outletShifts?: {
    outletName: string;
    shift: string;
    tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
  }[],
): number {
  const profile = agencyPRs?.find((p) => p.id === slot.prId);
  const outletShift = outletShifts
    ? findOutletShiftForRosterSlot(outletShifts, slot)
    : undefined;
  return estimateRosterSlotPayout(slot, {
    trainingLevel: profile?.trainingLevel,
    rules,
    perDrinkRm,
    shiftTierRates: outletShift?.tierRates,
  });
}

/** Live floor cards derived from agency roster (on-duty / en-route with check-in). */
export function deriveLiveWorkforce(
  roster: AgencyRosterSlot[],
  dateIso: string = DEFAULT_ROSTER_DATE_ISO,
  rules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
  perDrinkRm = 12,
  agencyPRs?: { id: string; name: string; trainingLevel?: string }[],
): LiveWorkforceEntry[] {
  return roster
    .filter(
      (s) =>
        s.dateIso === dateIso &&
        (s.status === 'on-duty' ||
          s.status === 'en-route' ||
          s.status === 'scheduled'),
    )
    .filter(
      (s) =>
        s.status === 'en-route' || (s.status === 'on-duty' && !!s.checkedInAt),
    )
    .map((s) => ({
      id: s.id,
      prName: resolveRosterPrName(s.prId, s.prName, agencyPRs),
      outlet: s.outlet,
      status: s.status === 'on-duty' && s.checkedInAt ? 'on-duty' : 'en-route',
      checkIn: s.checkedInAt,
      checkOut: s.checkedOutAt,
      estPayout: estimateRosterSlotPayoutForPr(s, agencyPRs, rules, perDrinkRm),
      drinks: s.floorDrinks ?? 0,
      tips: s.floorTips ?? 0,
    }));
}

type OutletShiftSlot = {
  outletName: string;
  status: string;
  prs: string[];
  filled: number;
  quantity: number;
};

/** Patch late / no-show flags on a PR's roster slot for the demo date */
export function patchPrRosterAttendanceFlags(
  roster: AgencyRosterSlot[],
  prId: string,
  outlet: string,
  dateIso: string,
  patch: { lateFlag?: boolean; noShowFlag?: boolean },
): AgencyRosterSlot[] {
  const idx = roster.findIndex(
    (s) =>
      s.prId === prId &&
      s.dateIso === dateIso &&
      outletMatches(s.outlet, outlet),
  );
  if (idx < 0) return roster;
  return roster.map((s, i) => (i === idx ? { ...s, ...patch } : s));
}

/** Add a PR to the first open outlet shift with capacity */
export function addPrToOutletShift<T extends OutletShiftSlot>(
  shifts: T[],
  outlet: string,
  prId: string,
): T[] {
  const idx = shifts.findIndex(
    (s) =>
      outletMatches(s.outletName, outlet) &&
      s.status !== 'sealed' &&
      !s.prs.includes(prId) &&
      s.filled < s.quantity,
  );
  if (idx < 0) return shifts;
  return fillOutletShiftSlot(shifts, idx, prId);
}

function fillOutletShiftSlot<T extends OutletShiftSlot>(
  shifts: T[],
  idx: number,
  prId: string,
): T[] {
  if (idx < 0 || idx >= shifts.length) return shifts;
  const sh = shifts[idx];
  if (
    sh.status === 'sealed' ||
    sh.prs.includes(prId) ||
    sh.filled >= sh.quantity
  )
    return shifts;
  return shifts.map((row, i) => {
    if (i !== idx) return row;
    const prs = [...row.prs, prId];
    return { ...row, prs, filled: prs.length };
  });
}

/** Remove a PR from all matching outlet shifts (e.g. PR cancellation). */
export function removePrFromOutletShifts<T extends OutletShiftSlot>(
  shifts: T[],
  outlet: string,
  prId: string,
): T[] {
  return shifts.map((sh) => {
    if (!outletMatches(sh.outletName, outlet) || !sh.prs.includes(prId))
      return sh;
    const prs = sh.prs.filter((id) => id !== prId);
    return { ...sh, prs, filled: prs.length };
  });
}

const ROSTER_BOOKED_FOR_OUTLET = new Set<AgencyRosterSlot['status']>([
  'scheduled',
  'on-duty',
  'en-route',
  'swap-pending',
  'assignment-pending',
]);

function postedShiftIdFromAssignment(
  outletShiftId?: string,
): string | undefined {
  if (!outletShiftId?.trim()) return undefined;
  return outletShiftId.startsWith('posted-')
    ? outletShiftId.slice('posted-'.length)
    : outletShiftId;
}

function rosterSlotMatchesOutletShift<
  T extends {
    id: string;
    outletName: string;
    date: string;
    dateIso?: string;
    shift: string;
    status: string;
  },
>(slot: AgencyRosterSlot, shift: T): boolean {
  if (!ROSTER_BOOKED_FOR_OUTLET.has(slot.status)) return false;
  if (!outletMatches(slot.outlet, shift.outletName)) return false;

  const linkedId = postedShiftIdFromAssignment(
    slot.agencyAssignment?.outletShiftId,
  );
  if (linkedId && linkedId === shift.id) return true;

  const shiftIso = shiftDateIso(shift.date, shift.dateIso);
  return slot.dateIso === shiftIso && slot.shift === shift.shift;
}

/** Keep outlet shift.prs aligned with agency roster bookings (assign, hydrate, cancel). */
export function syncAgencyRosterToOutletShifts<
  T extends OutletShiftSlot & {
    id: string;
    date: string;
    dateIso?: string;
    shift: string;
    releasedEarlyPrIds?: string[];
  },
>(
  shifts: T[],
  roster: AgencyRosterSlot[],
  todayIso = DEFAULT_ROSTER_DATE_ISO,
): T[] {
  if (roster.length === 0) return shifts;

  return shifts.map((shift) => {
    if (shift.status === 'sealed') return shift;
    const released = new Set(shift.releasedEarlyPrIds ?? []);
    const rosterPrIds = roster
      .filter((slot) => rosterSlotMatchesOutletShift(slot, shift))
      .map((slot) => slot.prId);
    const prs = [...new Set([...(shift.prs ?? []), ...rosterPrIds])].filter(
      (id) => !released.has(id),
    );
    if (
      prs.length === (shift.prs ?? []).length &&
      prs.every((id, i) => id === (shift.prs ?? [])[i])
    ) {
      return shift;
    }
    return { ...shift, prs, filled: prs.length };
  });
}

/** Fill a specific posted outlet shift (agency roster planning) */
export function addPrToPostedOutletShift<
  T extends OutletShiftSlot & { id: string },
>(shifts: T[], postedShiftId: string, prId: string, outlet: string): T[] {
  const idx = shifts.findIndex(
    (s) =>
      s.id === postedShiftId &&
      outletMatches(s.outletName, outlet) &&
      s.status !== 'sealed' &&
      !s.prs.includes(prId) &&
      s.filled < s.quantity,
  );
  if (idx >= 0) return fillOutletShiftSlot(shifts, idx, prId);
  return addPrToOutletShift(shifts, outlet, prId);
}

export function floorTipsForOutletFromRoster(
  roster: AgencyRosterSlot[],
  outletName: string,
  dateIso: string = DEFAULT_ROSTER_DATE_ISO,
): number {
  return roster
    .filter((s) => s.dateIso === dateIso && outletMatches(s.outlet, outletName))
    .reduce((sum, s) => sum + (s.floorTips ?? 0), 0);
}

/** Recompute reconciliation totals from outlet gross + PV net (variance = outlet − PV). */
export function recomputeReconciliation(input: {
  outletGross: number;
  pvTotal: number;
  dateIso: string;
  dateLabel: string;
  agencyConfirmed: boolean;
  outletConfirmed: boolean;
}): AgencyReconciliationDay {
  const variance = Math.round((input.outletGross - input.pvTotal) * 100) / 100;
  return {
    dateIso: input.dateIso,
    dateLabel: input.dateLabel,
    outletSalesTotal: input.outletGross,
    pvTotal: input.pvTotal,
    variance,
    agencyConfirmed: input.agencyConfirmed,
    outletConfirmed: input.outletConfirmed,
  };
}

export function sumPvNetForCycle(pvs: PrPaymentVoucher[]): number {
  return Math.round(pvs.reduce((s, p) => s + p.net, 0) * 100) / 100;
}

/** PR history shifts tab — same log as agency/outlet */
export function shiftHistoryForPr(
  rows: ShiftHistoryRow[],
  prId: string,
): ShiftHistoryRow[] {
  return prepareShiftHistoryForDisplay(rows).filter((r) => r.prId === prId);
}

/** PR History shifts tab — sealed log + inbox PV rows; disputed weeks hidden. */
export function shiftHistoryToHistRows(
  rows: ShiftHistoryRow[],
  prId?: string,
  vouchers: PrPaymentVoucher[] = [],
): HistRow[] {
  const list = prId
    ? prepareShiftHistoryForDisplay(rows).filter((r) => r.prId === prId)
    : prepareShiftHistoryForDisplay(rows);

  const disputedWeeks = new Set(
    vouchers
      .filter((pv) => pv.weekStartIso && pv.status === 'DISPUTED')
      .map((pv) => pv.weekStartIso!),
  );
  const inboxWeeks = new Set(
    vouchers
      .filter((pv) => pv.weekStartIso && pv.status === 'SENT')
      .map((pv) => pv.weekStartIso!),
  );

  const shiftRows: HistRow[] = list
    .filter((row) => {
      const weekSun = getPayrollWeekSundayIso(row.dateIso);
      if (
        disputedWeeks.has(weekSun) ||
        isPayrollWeekHiddenInHistory(weekSun, vouchers)
      ) {
        return false;
      }
      if (
        inboxWeeks.has(weekSun) ||
        isPayrollWeekFromInboxPv(weekSun, vouchers)
      ) {
        return false;
      }
      if (isShiftHiddenInHistory(row.dateIso, vouchers)) return false;
      const pv = pvForPayrollDate(row.dateIso, vouchers);
      if (pv && isPrPaymentInboxPv(pv)) return false;
      return true;
    })
    .map((row) => {
      const [y, m, d] = row.dateIso.split('-').map(Number);
      const { st, pill } = deriveShiftHistoryStatus(row.dateIso, vouchers);
      const income = shiftRowIncomeBreakdown(row);
      const total = income.wages + income.drinks + income.tips + income.others;
      return {
        d: [y, m, d] as [number, number, number],
        venue: row.outlet,
        wages: Math.round(income.wages),
        sales: Math.round(total),
        others: Math.round(income.others),
        drinks: Math.round(income.drinks),
        tips: Math.round(income.tips),
        st,
        pill,
        durationHours: row.durationHours,
      };
    });

  const inboxRows = vouchers
    .filter((pv) => pv.weekStartIso && pv.status === 'SENT')
    .flatMap((pv) => histRowsFromInboxPv(pv));

  return [...shiftRows, ...inboxRows].sort((a, b) => {
    const ak = `${a.d[0]}-${String(a.d[1]).padStart(2, '0')}-${String(a.d[2]).padStart(2, '0')}`;
    const bk = `${b.d[0]}-${String(b.d[1]).padStart(2, '0')}-${String(b.d[2]).padStart(2, '0')}`;
    return bk.localeCompare(ak);
  });
}

export function shiftHistoryForOutlet(
  rows: ShiftHistoryRow[] | undefined,
  outletName: string,
): ShiftHistoryRow[] {
  return sortShiftHistoryDesc(
    (rows ?? []).filter((r) => outletMatches(r.outlet, outletName)),
  );
}

/** Build a history row when a PR checks out or outlet seals a shift */
export function buildShiftHistoryRow(input: {
  prId: string;
  prName: string;
  outlet: string;
  dateIso: string;
  dateDisplay: string;
  totalPayout: number;
  totalDrinks: number;
  totalTips: number;
  drinkSalesRm?: number;
  totalTables?: number;
  wagesRm?: number;
  otRm?: number;
  drinkCommissionRm?: number;
  tipCommissionRm?: number;
  tableCommissionRm?: number;
  durationHours?: number;
}): ShiftHistoryRow {
  return {
    id: 'h' + Date.now().toString(36),
    prId: input.prId,
    prName: input.prName,
    outlet: canonicalOutlet(input.outlet),
    agencyName: DEFAULT_AGENCY_OWNER.orgName,
    dateDisplay: input.dateDisplay,
    dateIso: input.dateIso,
    totalPayout: input.totalPayout,
    totalDrinks: input.totalDrinks,
    totalTips: input.totalTips,
    drinkSalesRm: input.drinkSalesRm,
    totalTables: input.totalTables ?? 0,
    wagesRm: input.wagesRm,
    otRm: input.otRm,
    drinkCommissionRm: input.drinkCommissionRm,
    tipCommissionRm: input.tipCommissionRm,
    tableCommissionRm: input.tableCommissionRm,
    durationHours: input.durationHours ?? 6,
  };
}

/** Sync roster check-in when PR checks in on their app */
function formatRosterDateLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const rest = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${weekday} · ${rest}`;
}

export function parseShiftWindow(shift: string): {
  shiftStart: string;
  shiftEnd: string;
} {
  const parts = shift.split(/[—–-]/).map((s) => s.trim());
  return { shiftStart: parts[0] ?? '22:00', shiftEnd: parts[1] ?? '04:00' };
}

export function shiftDateIso(shiftDate: string, dateIso?: string): string {
  return resolveOutletShiftDateIso(shiftDate, dateIso, DEFAULT_ROSTER_DATE_ISO);
}

/** Roster cell when an outlet requests a specific PR for a posted shift */
export function outletRequestRosterSlotFromApplicant(
  app: ShiftApplicant,
  shift: ShiftRequest,
): AgencyRosterSlot {
  const { shiftStart, shiftEnd } = parseShiftWindow(shift.shift);
  const dateIso = shiftDateIso(shift.date, shift.dateIso);
  const stamp = new Date().toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const { demand, supplied } = outletShiftDemandSupplied(shift);
  return {
    id: `rs-outlet-req-${app.id}`,
    prId: app.prId,
    prName: app.prName,
    outlet: canonicalOutlet(shift.outletName),
    date:
      shift.date === 'Tonight' || shift.date === 'Tomorrow'
        ? formatRosterDateLabel(dateIso)
        : shift.date,
    dateIso,
    shift: shift.shift,
    shiftStart,
    shiftEnd,
    status: 'outlet-request-pending',
    agencyAssignment: {
      agencyName: DEFAULT_PR_AGENCY_NAME,
      assignedAt: stamp,
      assignedAtMs: Date.now(),
      agencyNote: `${shift.event} — outlet requested ${app.prName}`,
      outletShiftId: shift.id,
      shiftApplicantId: app.id,
      requestedByOutlet: true,
      eventDemand: demand,
      eventSupplied: supplied,
    },
  };
}

export function buildOutletRequestRosterSlots(
  shifts: ShiftRequest[],
  applicants: ShiftApplicant[],
): AgencyRosterSlot[] {
  return applicants
    .filter((a) => a.status === 'pending' && a.source === 'outlet_request')
    .flatMap((app) => {
      const shift = shifts.find((s) => s.id === app.shiftId);
      if (!shift || shift.status === 'sealed') return [];
      return [outletRequestRosterSlotFromApplicant(app, shift)];
    });
}

export function mergeOutletRequestRosterSlots(
  roster: AgencyRosterSlot[],
  shifts: ShiftRequest[],
  applicants: ShiftApplicant[],
): AgencyRosterSlot[] {
  const pending = buildOutletRequestRosterSlots(shifts, applicants);
  const pendingApplicantIds = new Set(
    pending.map((p) => p.agencyAssignment?.shiftApplicantId).filter(Boolean),
  );
  const withoutStale = roster.filter(
    (s) =>
      s.status !== 'outlet-request-pending' ||
      pendingApplicantIds.has(s.agencyAssignment?.shiftApplicantId ?? ''),
  );
  const existingIds = new Set(withoutStale.map((s) => s.id));
  const toAdd = pending.filter((p) => !existingIds.has(p.id));
  return [...toAdd, ...withoutStale];
}

export interface RosterSlotSeed {
  prId: string;
  prName: string;
  outlet: string;
  dateIso?: string;
  dateLabel?: string;
  shift?: string;
}

function findRosterSlot(
  roster: AgencyRosterSlot[],
  prId: string,
  outlet: string,
  dateIso: string,
): AgencyRosterSlot | undefined {
  const canon = canonicalOutlet(outlet);
  return roster.find(
    (s) =>
      s.prId === prId &&
      s.dateIso === dateIso &&
      outletMatches(s.outlet, canon),
  );
}

/** Create a roster slot when a PR is booked on a shift but has no roster row yet */
export function ensureRosterSlot(
  roster: AgencyRosterSlot[],
  seed: RosterSlotSeed,
  status: AgencyRosterSlot['status'] = 'scheduled',
  patch?: Partial<AgencyRosterSlot>,
): AgencyRosterSlot[] {
  const dateIso = seed.dateIso ?? DEFAULT_ROSTER_DATE_ISO;
  const existing = findRosterSlot(roster, seed.prId, seed.outlet, dateIso);
  if (existing) {
    return roster.map((s) =>
      s.id === existing.id
        ? { ...s, ...patch, status: patch?.status ?? status }
        : s,
    );
  }
  const canon = canonicalOutlet(seed.outlet);
  const { shiftStart, shiftEnd } = parseShiftWindow(
    seed.shift ?? '22:00 — 04:00',
  );
  const shift = seed.shift ?? `${shiftStart} — ${shiftEnd}`;
  const slot: AgencyRosterSlot = {
    id: `rs-${seed.prId}-${dateIso}`,
    prId: seed.prId,
    prName: seed.prName,
    outlet: canon,
    date: seed.dateLabel ?? formatRosterDateLabel(dateIso),
    dateIso,
    shift,
    shiftStart,
    shiftEnd,
    status,
    ...patch,
  };
  return [slot, ...roster];
}

/** PR tapped "on my way" — booked → en-route (still outside geofence until check-in) */
export function rosterEnRoute(
  roster: AgencyRosterSlot[],
  prId: string,
  outlet: string,
  seed?: Omit<RosterSlotSeed, 'prId' | 'outlet'>,
): AgencyRosterSlot[] {
  const canon = canonicalOutlet(outlet);
  const dateIso = seed?.dateIso ?? DEFAULT_ROSTER_DATE_ISO;
  const existing = findRosterSlot(roster, prId, outlet, dateIso);

  if (existing) {
    if (existing.status === 'on-duty' || existing.status === 'en-route')
      return roster;
    if (
      existing.status === 'scheduled' ||
      existing.status === 'assignment-pending'
    ) {
      return roster.map((s) =>
        s.id === existing.id
          ? { ...s, status: 'en-route' as const, noShowFlag: false }
          : s,
      );
    }
    return roster;
  }

  if (!seed?.prName) return roster;

  const { shiftStart, shiftEnd } = parseShiftWindow(
    seed.shift ?? '22:00 — 04:00',
  );
  return ensureRosterSlot(
    roster,
    { prId, outlet: canon, dateIso, ...seed },
    'en-route',
    {
      shiftStart,
      shiftEnd,
    },
  );
}

export function rosterCheckIn(
  roster: AgencyRosterSlot[],
  prId: string,
  outlet: string,
  time: string,
  seed?: Omit<RosterSlotSeed, 'prId' | 'outlet'>,
): AgencyRosterSlot[] {
  const canon = canonicalOutlet(outlet);
  const dateIso = seed?.dateIso ?? DEFAULT_ROSTER_DATE_ISO;
  const existing = findRosterSlot(roster, prId, outlet, dateIso);

  if (existing) {
    if (
      existing.status === 'scheduled' ||
      existing.status === 'en-route' ||
      existing.status === 'assignment-pending' ||
      existing.status === 'on-duty'
    ) {
      return roster.map((s) =>
        s.id === existing.id
          ? {
              ...s,
              status: 'on-duty' as const,
              checkedInAt: time,
              checkedOutAt: undefined,
              noShowFlag: false,
            }
          : s,
      );
    }
    return roster;
  }

  if (!seed?.prName) return roster;

  const { shiftStart, shiftEnd } = parseShiftWindow(
    seed.shift ?? '22:00 — 04:00',
  );
  return ensureRosterSlot(
    roster,
    { prId, outlet: canon, dateIso, ...seed },
    'on-duty',
    {
      checkedInAt: time,
      checkedOutAt: undefined,
      noShowFlag: false,
      shiftStart,
      shiftEnd,
    },
  );
}

/** Sync roster check-out */
export function rosterCheckOut(
  roster: AgencyRosterSlot[],
  prId: string,
  outlet: string,
  time: string,
  opts?: { shift?: string },
): AgencyRosterSlot[] {
  const canon = canonicalOutlet(outlet);
  return roster.map((s) => {
    if (s.prId !== prId || !outletMatches(s.outlet, canon)) return s;
    if (opts?.shift && s.shift && s.shift !== opts.shift) return s;
    const releasable = [
      'on-duty',
      'en-route',
      'scheduled',
      'assignment-pending',
      'outlet-pending',
    ].includes(s.status);
    if (!releasable) return s;
    return {
      ...s,
      // Keep a floor-compatible status; UI treats checkedOutAt as released / checked out.
      status: 'scheduled' as const,
      checkedInAt: undefined,
      checkedOutAt: time,
    };
  });
}

/** Apply shift.releasedEarly* onto agency roster so status UIs show released / sent home. */
export function syncEarlyReleasesToRoster<
  T extends {
    outletName: string;
    shift: string;
    releasedEarlyPrIds?: string[];
    releasedEarlyAt?: Record<string, string>;
  },
>(roster: AgencyRosterSlot[], shifts: T[]): AgencyRosterSlot[] {
  let next = roster;
  for (const sh of shifts) {
    const released = [...new Set(sh.releasedEarlyPrIds ?? [])];
    if (!released.length) continue;
    for (const prId of released) {
      const time =
        sh.releasedEarlyAt?.[prId] ??
        new Date().toLocaleTimeString('en-MY', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      next = rosterCheckOut(next, prId, sh.outletName, time, {
        shift: sh.shift,
      });
    }
  }
  return next;
}

export type PrAttendanceRosterSync = {
  prId: string;
  prName: string;
  checkedIn: boolean;
  checkedOut?: boolean;
  checkOutTime?: string;
  session?: {
    outlet: string;
    shiftTime: string;
    timeIn: string;
  } | null;
  dateIso?: string;
};

/** Mirror PR portal check-in / check-out onto agency roster slots. */
export function syncPrAttendanceToRoster(
  roster: AgencyRosterSlot[],
  input: PrAttendanceRosterSync,
): AgencyRosterSlot[] {
  if (!input.session) return roster;
  if (input.checkedOut) {
    const checkOutTime =
      input.checkOutTime ??
      new Date().toLocaleTimeString('en-MY', {
        hour: '2-digit',
        minute: '2-digit',
      });
    return rosterCheckOut(
      roster,
      input.prId,
      input.session.outlet,
      checkOutTime,
    );
  }
  if (!input.checkedIn) return roster;
  const checkInTime =
    input.session.timeIn.match(/\d{1,2}:\d{2}/)?.[0] ?? input.session.timeIn;
  return rosterCheckIn(roster, input.prId, input.session.outlet, checkInTime, {
    prName: input.prName,
    dateIso: input.dateIso ?? DEFAULT_ROSTER_DATE_ISO,
    shift: input.session.shiftTime,
  });
}

/** Outlet shift PR list aligned with agency managed PRs */
export function marketplacePrsFromAgency(
  agencyPRs: {
    id: string;
    name: string;
    rating: number;
    languages: string[];
    comcardImageUrl?: string | null;
  }[],
) {
  const avatars: Record<string, string> = {
    p1: '🌙',
    p2: '✨',
    p3: '🥂',
    p4: '💎',
    p5: '🌹',
    p6: '🎐',
    p7: '⭐',
    p8: '🌸',
    p9: '💫',
    p10: '🔥',
    p11: '📋',
  };
  return agencyPRs.map((p) => ({
    id: p.id,
    name: formatPrDisplayName(p.id, p.name),
    rating: p.rating,
    languages: p.languages.map((l) =>
      l.length <= 3 ? l : l.slice(0, 2).toUpperCase(),
    ),
    status: 'available' as const,
    avatar: avatars[p.id] ?? '✨',
    comcardImageUrl: p.comcardImageUrl ?? null,
  }));
}

export function tonightShiftOutletName(
  shifts: ShiftRequest[] | undefined,
): string {
  const list = shifts ?? [];
  const tonight = list.find((s) => s.date === 'Tonight') ?? list[0];
  return tonight
    ? canonicalOutlet(tonight.outletName)
    : DEFAULT_OUTLET_CANONICAL;
}
