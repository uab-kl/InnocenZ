import { addDays, format, startOfWeek } from 'date-fns';
import type { AgencyRosterSlot } from '@agency-portal/lib/agency-demo';

/** Parse yyyy-MM-dd in local time — avoids UTC midnight shifting the calendar day */
export function parseLocalIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function mondayOfWeek(dateIso: string): string {
  return formatLocalIso(
    startOfWeek(parseLocalIso(dateIso), { weekStartsOn: 1 }),
  );
}

export function weekDayIsos(weekStartIso: string): string[] {
  const start = parseLocalIso(weekStartIso);
  return Array.from({ length: 7 }, (_, i) => formatLocalIso(addDays(start, i)));
}

export function weekRangeLabel(weekStartIso: string): string {
  const start = parseLocalIso(weekStartIso);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'd')}–${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd MMM')}–${format(end, 'd MMM yyyy')}`;
}

export function dayColumnLabel(dateIso: string): { dow: string; dom: string } {
  const d = parseLocalIso(dateIso);
  return { dow: format(d, 'EEE'), dom: format(d, 'd MMM') };
}

const SLOT_DISPLAY_PRIORITY: AgencyRosterSlot['status'][] = [
  'on-duty',
  'en-route',
  'scheduled',
  'assignment-pending',
  'outlet-request-pending',
  'outlet-pending',
  'swap-pending',
  'unavailable',
];

export function slotsForPrOnDate(
  roster: AgencyRosterSlot[],
  prId: string,
  dateIso: string,
): AgencyRosterSlot[] {
  return roster.filter((s) => s.prId === prId && s.dateIso === dateIso);
}

/** Prefer live / booked shifts over day-off markers when multiple slots exist */
export function primarySlotForPrOnDate(
  roster: AgencyRosterSlot[],
  prId: string,
  dateIso: string,
): AgencyRosterSlot | undefined {
  const slots = slotsForPrOnDate(roster, prId, dateIso);
  if (slots.length === 0) return undefined;
  return [...slots].sort((a, b) => {
    // Prefer active assignment over early-released / checked-out same-day slot.
    const aOut = a.checkedOutAt ? 1 : 0;
    const bOut = b.checkedOutAt ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    return (
      SLOT_DISPLAY_PRIORITY.indexOf(a.status) -
      SLOT_DISPLAY_PRIORITY.indexOf(b.status)
    );
  })[0];
}

export function slotForPrOnDate(
  roster: AgencyRosterSlot[],
  prId: string,
  dateIso: string,
): AgencyRosterSlot | undefined {
  return primarySlotForPrOnDate(roster, prId, dateIso);
}

/** One row per PR per night — drops lower-priority duplicate slots (e.g. assignment-pending backup). */
export function dedupeLiveRosterByPr(
  slots: AgencyRosterSlot[],
): AgencyRosterSlot[] {
  const keys = new Set(slots.map((s) => `${s.prId}|${s.dateIso}`));
  const keptIds = new Set<string>();
  for (const key of keys) {
    const [prId, dateIso] = key.split('|');
    const primary = primarySlotForPrOnDate(slots, prId, dateIso);
    if (primary) keptIds.add(primary.id);
  }
  return slots.filter((s) => keptIds.has(s.id));
}

export function shiftWeek(dateIso: string, deltaWeeks: number): string {
  return formatLocalIso(addDays(parseLocalIso(dateIso), deltaWeeks * 7));
}
