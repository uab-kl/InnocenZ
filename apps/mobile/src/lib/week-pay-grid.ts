/**
 * A week's Payment grid built from real backend voucher lines — the replacement
 * for the demo `buildThisWeekPayGrid` / `buildLastWeekPayGrid`. Buckets each
 * line by its day and kind (wages / drinks / tips / others). A day with any line
 * reads verified once the agency has processed the voucher, APPROVED once the
 * agency has signed that day off in its own day review, otherwise pending.
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
  // The agency's day-by-day sign-off, which happens DURING the week — long
  // before the voucher's own status moves. Absent (older backend) simply means
  // no day is approved yet, which is what the screen used to assume anyway.
  const approvedDays = new Set(
    (week.dayReviews ?? []).filter((d) => d.status === 'approved').map((d) => d.date),
  );
  /**
   * A day the server sent back as NOT approved — held, unreviewed, or downgraded
   * because a receipt on it is still pending.
   *
   * It has to outrank the voucher's own status. A sent voucher used to paint
   * every day VERIFIED before this map was even consulted, so an agency
   * withdrawing a receipt approval on an already-sent voucher left the PR
   * looking at the strongest possible pill over the weakest possible evidence —
   * and signing on it. Absent from `dayReviews` (or an older backend that sends
   * none) is NOT a downgrade: that is the legacy path and behaves as before.
   */
  const reviewed = new Map((week.dayReviews ?? []).map((d) => [d.date, d.status]));
  const downgraded = (iso: string) => reviewed.has(iso) && reviewed.get(iso) !== 'approved';
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
      status:
        dayLines.length === 0
          ? 'empty'
          : verified && !downgraded(iso)
            ? 'verified'
            : approvedDays.has(iso)
              ? 'approved'
              : 'pending',
    });
  }
  return days;
}
