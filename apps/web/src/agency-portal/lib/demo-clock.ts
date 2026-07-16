import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns';

/** Original prototype "today" — migrate persisted demo data forward */
export const DEMO_ANCHOR_DATE_ISO = '2026-06-04';
/** Payroll week (Sun–Sat) that contained the prototype anchor */
export const DEMO_ANCHOR_WEEK_SUNDAY_ISO = '2026-05-31';
/** @deprecated use DEMO_ANCHOR_WEEK_SUNDAY_ISO */
export const DEMO_ANCHOR_WEEK_MONDAY_ISO = DEMO_ANCHOR_WEEK_SUNDAY_ISO;

export function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function ymdToIso(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function getLiveTodayYmd(): [number, number, number] {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
}

export function getLiveTodayIso(): string {
  const [y, m, d] = getLiveTodayYmd();
  return ymdToIso(y, m, d);
}

export function getShiftToday(): [number, number, number] {
  return getLiveTodayYmd();
}

export function getPayrollWeekSundayIso(fromIso = getLiveTodayIso()): string {
  return format(
    startOfWeek(parseISO(fromIso), { weekStartsOn: 0 }),
    'yyyy-MM-dd',
  );
}

/** @deprecated use getPayrollWeekSundayIso */
export function getPayrollWeekMondayIso(fromIso = getLiveTodayIso()): string {
  return getPayrollWeekSundayIso(fromIso);
}

export function getPreviousWeekSundayIso(fromIso = getLiveTodayIso()): string {
  return addDaysToIso(getPayrollWeekSundayIso(fromIso), -7);
}

export function addDaysToIso(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd');
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function weekdayFromIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function weekdayNameFromIso(iso: string): string {
  return WEEKDAY_NAMES[weekdayFromIso(iso)]!;
}

/** Next calendar date on the given weekday (0=Sun … 6=Sat) from a reference ISO date. */
export function isoOnWeekday(
  fromIso: string,
  weekday: number,
  allowSameDay = false,
): string {
  const todayDow = weekdayFromIso(fromIso);
  let delta = (weekday - todayDow + 7) % 7;
  if (delta === 0 && !allowSameDay) delta = 7;
  return addDaysToIso(fromIso, delta);
}

export function ymdFromIso(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

export function weekdayEventName(weekday: number, suffix: string): string {
  return `${WEEKDAY_NAMES[weekday]} ${suffix}`;
}

/** PV issues on the Sunday after a Sun–Sat week ends. */
export function isWeekPvIssuedOnCalendar(
  weekEndIso: string,
  fromIso = getLiveTodayIso(),
): boolean {
  return fromIso >= addDaysToIso(weekEndIso, 1);
}

/** Slide a date from the anchor payroll week onto the live payroll week */
export function remapIsoByWeekSlide(
  iso: string,
  anchorSundayIso = DEMO_ANCHOR_WEEK_SUNDAY_ISO,
): string {
  const dayOffset = differenceInCalendarDays(
    parseISO(iso),
    parseISO(anchorSundayIso),
  );
  const targetSunday = parseISO(getPayrollWeekSundayIso());
  return format(addDays(targetSunday, dayOffset), 'yyyy-MM-dd');
}

const ANCHOR_WEEK_END_ISO = '2026-06-06';

/** Move legacy demo dates onto the live calendar */
export function migrateDemoDateIso(iso: string): string {
  if (!iso) return getLiveTodayIso();
  if (iso === DEMO_ANCHOR_DATE_ISO) return getLiveTodayIso();
  if (iso >= DEMO_ANCHOR_WEEK_SUNDAY_ISO && iso <= ANCHOR_WEEK_END_ISO) {
    return remapIsoByWeekSlide(iso);
  }
  return iso;
}

export function migrateDemoYmd(
  date: [number, number, number],
): [number, number, number] {
  const iso = migrateDemoDateIso(ymdToIso(date[0], date[1], date[2]));
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}
