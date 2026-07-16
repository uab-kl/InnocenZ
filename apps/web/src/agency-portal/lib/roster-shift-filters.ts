import type {
  AgencyManagedPR,
  AgencyRosterSlot,
  RosterSlotStatus,
} from '@agency-portal/lib/agency-demo';
import type { AgencyOutletAvailableShift } from '@agency-portal/lib/agency-outlet-shifts';
import { parseShiftWindow } from '@agency-portal/lib/portal-sync';

export type RosterShiftFilterState = {
  nameQuery: string;
  outlet: string;
  status: '' | RosterSlotStatus | 'late' | 'no-show';
  payoutMin: string;
  payoutMax: string;
  startTime: string;
  endTime: string;
};

/** Extra filters for the weekly planning timetable */
export type RosterTimetableFilterState = RosterShiftFilterState & {
  prType: '' | 'agency';
  showPrs: '' | 'scheduled' | 'free';
};

export const EMPTY_ROSTER_SHIFT_FILTERS: RosterShiftFilterState = {
  nameQuery: '',
  outlet: '',
  status: '',
  payoutMin: '',
  payoutMax: '',
  startTime: '',
  endTime: '',
};

export const EMPTY_ROSTER_TIMETABLE_FILTERS: RosterTimetableFilterState = {
  ...EMPTY_ROSTER_SHIFT_FILTERS,
  prType: '',
  showPrs: '',
};

function hhmmToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [h, m] = trimmed.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function rosterShiftFiltersActive(f: RosterShiftFilterState): boolean {
  return Boolean(
    f.nameQuery ||
    f.outlet ||
    f.status ||
    f.payoutMin ||
    f.payoutMax ||
    f.startTime ||
    f.endTime,
  );
}

export function rosterTimetableFiltersActive(
  f: RosterTimetableFilterState,
): boolean {
  return rosterShiftFiltersActive(f) || Boolean(f.prType || f.showPrs);
}

/** Filters that narrow outlet shifts in the assign modal (not PR name / roster status). */
export function planningOutletShiftFiltersActive(
  f: RosterShiftFilterState,
): boolean {
  return Boolean(
    f.outlet || f.payoutMin || f.payoutMax || f.startTime || f.endTime,
  );
}

export function filterPlanningOutletShifts(
  shifts: AgencyOutletAvailableShift[],
  f: RosterShiftFilterState,
): AgencyOutletAvailableShift[] {
  const min = f.payoutMin ? parseFloat(f.payoutMin) : null;
  const max = f.payoutMax ? parseFloat(f.payoutMax) : null;
  const startFrom = hhmmToMinutes(f.startTime);
  const endBy = hhmmToMinutes(f.endTime);

  return shifts.filter((shift) => {
    if (f.outlet && shift.outlet !== f.outlet) return false;
    if (min != null && !Number.isNaN(min) && shift.payEstimate < min)
      return false;
    if (max != null && !Number.isNaN(max) && shift.payEstimate > max)
      return false;
    const { shiftStart, shiftEnd } = parseShiftWindow(shift.shift);
    if (startFrom != null) {
      const slotStart = hhmmToMinutes(shiftStart);
      if (slotStart == null || slotStart < startFrom) return false;
    }
    if (endBy != null) {
      const slotEnd = hhmmToMinutes(shiftEnd);
      if (slotEnd == null || slotEnd > endBy) return false;
    }
    return true;
  });
}

export function filterRosterShifts(
  slots: AgencyRosterSlot[],
  f: RosterShiftFilterState,
): AgencyRosterSlot[] {
  const q = f.nameQuery.trim().toLowerCase();
  const min = f.payoutMin ? parseFloat(f.payoutMin) : null;
  const max = f.payoutMax ? parseFloat(f.payoutMax) : null;
  const startFrom = hhmmToMinutes(f.startTime);
  const endBy = hhmmToMinutes(f.endTime);

  return slots.filter((s) => {
    if (q && !s.prName.toLowerCase().includes(q)) return false;
    if (f.outlet && s.outlet !== f.outlet) return false;
    if (f.status === 'late' && !s.lateFlag) return false;
    if (f.status === 'no-show' && !s.noShowFlag) return false;
    if (f.status && f.status !== 'late' && f.status !== 'no-show') {
      const matches =
        f.status === 'scheduled'
          ? s.status === 'scheduled' || s.status === 'en-route'
          : s.status === f.status;
      if (!matches) return false;
    }
    const payout = s.estPayout ?? 0;
    if (min != null && !Number.isNaN(min) && payout < min) return false;
    if (max != null && !Number.isNaN(max) && payout > max) return false;
    if (startFrom != null) {
      const slotStart = hhmmToMinutes(s.shiftStart);
      if (slotStart == null || slotStart < startFrom) return false;
    }
    if (endBy != null) {
      const slotEnd = hhmmToMinutes(s.shiftEnd);
      if (slotEnd == null || slotEnd > endBy) return false;
    }
    return true;
  });
}

export function timetableSlotMatches(
  slot: AgencyRosterSlot,
  f: RosterShiftFilterState,
): boolean {
  return filterRosterShifts([slot], f).length > 0;
}

export function filterTimetablePrs(
  agencyPRs: AgencyManagedPR[],
  roster: AgencyRosterSlot[],
  weekDays: string[],
  f: RosterTimetableFilterState,
  getScheduleState: (
    prId: string,
    dateIso: string,
  ) => 'free' | 'booked' | 'unavailable',
): AgencyManagedPR[] {
  const q = f.nameQuery.trim().toLowerCase();

  return agencyPRs.filter((pr) => {
    if (pr.suspended || pr.detached) return false;
    if (q && !pr.name.toLowerCase().includes(q)) return false;

    const weekSlots = roster.filter(
      (s) => s.prId === pr.id && weekDays.includes(s.dateIso),
    );
    const matchingSlots = filterRosterShifts(weekSlots, f);
    const hasFreeDay = weekDays.some(
      (d) => getScheduleState(pr.id, d) === 'free',
    );

    if (f.showPrs === 'scheduled') return matchingSlots.length > 0;
    if (f.showPrs === 'free') return hasFreeDay;

    if (rosterShiftFiltersActive(f)) {
      return matchingSlots.length > 0 || hasFreeDay;
    }
    return true;
  });
}

export function countTimetableMatchingSlots(
  roster: AgencyRosterSlot[],
  weekDays: string[],
  prIds: Set<string>,
  f: RosterTimetableFilterState,
): number {
  return filterRosterShifts(
    roster.filter((s) => weekDays.includes(s.dateIso) && prIds.has(s.prId)),
    f,
  ).length;
}
