import type { DemoHistoryShift } from './demo-shifts';
import { fmtDFriendly, isoToYmd, todayYmd, ymdToIso } from './demo-shifts';
import type { HistPayWeek } from './demo-payment-history';

export type DayTimeFilter = {
  date: string;
  timeFrom: string;
  timeTo: string;
};

export const EMPTY_DAY_TIME: DayTimeFilter = {
  date: '',
  timeFrom: '',
  timeTo: '',
};

const PV_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export function dateFromIsoKey(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function isoKeyFromDate(date: Date) {
  return ymdToIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function formatHistDateKey(key: string): string {
  if (!key) return '';
  const [y, m, d] = isoToYmd(key);
  return fmtDFriendly(y, m, d);
}

export function parseDateInputMs(dateIso: string, time = '00:00'): number | null {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
}

/** Any calendar day up to today — days without rows simply show empty lists. */
export function isDateSelectableForFilter(date: Date, todayIso?: string) {
  const today = todayIso ?? ymdToIso(...todayYmd());
  return isoKeyFromDate(date) <= today;
}

export function calendarNavYears(dateKeys: string[], fallbackYear: number) {
  const years = dateKeys
    .map((k) => dateFromIsoKey(k)?.getFullYear())
    .filter((y): y is number => typeof y === 'number');
  const todayY = new Date().getFullYear();
  const minY = years.length ? Math.min(...years, todayY) : fallbackYear - 1;
  const maxY = years.length ? Math.max(...years, todayY, fallbackYear) : fallbackYear + 1;
  return Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i);
}

function parseAmPmToken(token: string): number | null {
  const m = token.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const pm = m[3].toLowerCase() === 'pm';
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return h * 60 + min;
}

function shiftMinutesOnDate(dateIso: string, timeRange: string): { start: number; end: number } | null {
  const parts = timeRange.split(/[–-]/).map((s) => s.trim());
  if (parts.length < 2) return null;
  const startMin = parseAmPmToken(parts[0]!);
  const endMin = parseAmPmToken(parts[1]!);
  if (startMin == null || endMin == null) return null;
  const base = parseDateInputMs(dateIso, '00:00');
  if (base == null) return null;
  let end = endMin;
  if (endMin <= startMin) end += 24 * 60;
  return {
    start: base + startMin * 60_000,
    end: base + end * 60_000,
  };
}

export function matchesShiftDayTime(
  shift: DemoHistoryShift,
  filter: DayTimeFilter,
): boolean {
  if (!filter.date) return true;
  if (shift.dateIso !== filter.date) return false;
  if (!filter.timeFrom && !filter.timeTo) return true;

  const range = shiftMinutesOnDate(filter.date, shift.time);
  if (!range) return true;

  const fromMs = parseDateInputMs(filter.date, filter.timeFrom || '00:00');
  const toMs = parseDateInputMs(filter.date, filter.timeTo || '23:59');
  if (fromMs == null || toMs == null) return true;
  return range.start <= toMs && range.end >= fromMs;
}

function payLineDateIso(lineDate: string, yearHint: number): string | null {
  const m = lineDate.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return null;
  const month = PV_MONTHS[m[2]!.slice(0, 3).toLowerCase()];
  if (!month) return null;
  return ymdToIso(yearHint, month, parseInt(m[1]!, 10));
}

function yearHintFromWeek(week: HistPayWeek): number {
  const m = week.issued.match(/\d{4}/);
  if (m) return parseInt(m[0], 10);
  const m2 = week.weekLabel.match(/\d{4}/);
  if (m2) return parseInt(m2[0], 10);
  return 2026;
}

function payWeekDateKeys(week: HistPayWeek): string[] {
  const y = yearHintFromWeek(week);
  const keys = new Set<string>();
  for (const line of week.lines) {
    const k = payLineDateIso(line.date, y);
    if (k) keys.add(k);
  }
  const issued = week.issued.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (issued) {
    const month = PV_MONTHS[issued[2]!.slice(0, 3).toLowerCase()];
    if (month) keys.add(ymdToIso(parseInt(issued[3]!, 10), month, parseInt(issued[1]!, 10)));
  }
  return [...keys];
}

function payEventMsOnDate(week: HistPayWeek, dateIso: string): number | null {
  const y = yearHintFromWeek(week);
  for (const line of week.lines) {
    const k = payLineDateIso(line.date, y);
    if (k === dateIso) return parseDateInputMs(dateIso, '12:00');
  }
  const issued = week.issued.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (issued) {
    const month = PV_MONTHS[issued[2]!.slice(0, 3).toLowerCase()];
    if (month) {
      const k = ymdToIso(parseInt(issued[3]!, 10), month, parseInt(issued[1]!, 10));
      if (k === dateIso) return parseDateInputMs(dateIso, '12:00');
    }
  }
  return null;
}

export function matchesPaymentWeekDayTime(
  week: HistPayWeek,
  filter: DayTimeFilter,
): boolean {
  if (!filter.date) return true;
  const keys = payWeekDateKeys(week);
  if (!keys.includes(filter.date)) return false;
  if (!filter.timeFrom && !filter.timeTo) return true;

  const eventMs = payEventMsOnDate(week, filter.date);
  if (!eventMs) return false;

  const fromMs = parseDateInputMs(filter.date, filter.timeFrom || '00:00');
  const toMs = parseDateInputMs(filter.date, filter.timeTo || '23:59');
  if (fromMs != null && eventMs < fromMs) return false;
  if (toMs != null && eventMs > toMs) return false;
  return true;
}

export function collectPaymentWeekDateKeys(week: HistPayWeek): string[] {
  return payWeekDateKeys(week);
}

export function buildDateOptionsFromKeys(keys: string[]): { key: string; label: string }[] {
  const uniq = [...new Set(keys.filter(Boolean))].sort((a, b) => b.localeCompare(a));
  return uniq.map((key) => ({ key, label: formatHistDateKey(key) }));
}
