/**
 * A week's Payment grid built from real backend voucher lines — the replacement
 * for the demo `buildThisWeekPayGrid` / `buildLastWeekPayGrid`. Buckets each
 * line by its day and kind (wages / drinks / tips / others). A day with any line
 * reads verified once the agency has processed the voucher, otherwise pending.
 * All-UTC so the day columns never TZ-shift.
 *
 * Shared by PaymentScreen (This/Last week) and PvDetailScreen (voucher doc),
 * so both always show the same numbers for the same voucher.
 */
import type { PrCurrentWeek, PrReceiptLine } from './api';
import type { WeeklyDayPay } from './demo-shifts';

const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Statuses that mean the agency has already processed the week's voucher. */
export const VERIFIED_STATUSES = ['sent', 'awaiting_pr', 'signed', 'paid'];

export function buildWeekGridFromLines(week: PrCurrentWeek | null): WeeklyDayPay[] {
  if (!week) return [];
  const verified = week.status !== null && VERIFIED_STATUSES.includes(week.status);
  const byIso = new Map<string, PrReceiptLine[]>();
  for (const line of week.lines) {
    const key = line.lineDate ?? week.weekStart;
    const arr = byIso.get(key) ?? [];
    arr.push(line);
    byIso.set(key, arr);
  }
  const start = new Date(`${week.weekStart}T00:00:00Z`);
  const days: WeeklyDayPay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayLines = byIso.get(iso) ?? [];
    const sumKind = (kind: PrReceiptLine['kind']) =>
      dayLines.filter((l) => l.kind === kind).reduce((s, l) => s + l.commission, 0);
    days.push({
      day: WEEKDAY_ABBR[d.getUTCDay()],
      date: d.getUTCDate(),
      dateIso: iso,
      wages: sumKind('wages'),
      drinks: sumKind('drinks'),
      tips: sumKind('tips'),
      others: sumKind('others'),
      status: dayLines.length > 0 ? (verified ? 'verified' : 'pending') : 'empty',
    });
  }
  return days;
}
