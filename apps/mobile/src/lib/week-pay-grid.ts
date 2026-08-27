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
import type { PrCurrentWeek, PrReceiptKind, PrReceiptLine } from './api';
import type { WeeklyDayPay } from './demo-shifts';

/**
 * ⚠️ STAYS ENGLISH — `WeeklyDayPay.day` is data, not copy.
 *
 * It is written into the signed-PV snapshot that `signed-pv.tsx` persists
 * (`linesFromGrid` copies `d.day` onto every stored line), and it is spliced
 * into the dispute reason PaymentScreen POSTs for the agency's web portal to
 * read. Translating it here would rewrite stored records and send Chinese into
 * a field the agency reads in English.
 *
 * The column header a PR reads is translated at the RENDER instead: derive the
 * weekday from the row's own `dateIso` and resolve it through `DAY_SHORT` in
 * `lib/demo-shifts.ts` (`t.schedule.daySun` … `daySat`).
 */
const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * A ROW of the Payment grid: the four earning buckets the server sends, plus
 * DEDUCTIONS — money taken off, which is not a kind of earning and must not be
 * netted against one.
 *
 * The server flattens `ot` and `deduction` into the same `others` kind, so a
 * night with RM 30 of overtime and a RM 20 cancellation fee arrived as one
 * `others: 10.00` cell — a number that is neither figure, under a label
 * claiming to be about odds and ends. Splitting them is why `component` was
 * added to the line.
 */
export type GridBucket = PrReceiptKind | 'deductions';

/**
 * Which grid row a line belongs to — THE bucketing rule, in one exported place.
 *
 * `cell-evidence.ts` re-derives a single cell to prove it, and its own header
 * warns that its filter must stay identical to this file's. Two copies of the
 * rule is precisely how that promise gets broken, so both call this.
 *
 * Falls back to `kind` when `component` is absent (a backend that has not
 * restarted): deductions then stay in Others, which is the behaviour that
 * shipped before. It never infers a deduction from a NEGATIVE AMOUNT — that
 * would promote a coincidence of today's data into a rule.
 */
export function gridBucket(line: PrReceiptLine): GridBucket {
  return line.component === 'deduction' ? 'deductions' : line.kind;
}

/** Statuses that mean the agency has already processed the week's voucher. */
export const VERIFIED_STATUSES = ['sent', 'awaiting_pr', 'signed', 'paid'];

export function buildWeekGridFromLines(
  week: PrCurrentWeek | null,
): WeeklyDayPay[] {
  if (!week) return [];
  /**
   * THE WEAKEST VOUCHER WINS, and this is the WEEK's grid, so it must ask every
   * voucher in it.
   *
   * ⚠️ This read `week.status` alone — the NEWEST voucher's, which `api.ts`
   * documents as "a headline, not the week". Since 0129 a PR on two rosters
   * holds one voucher PER AGENCY and this grid merges both agencies' lines, so
   * with Atlas `paid` arriving newest and Why We Met still `pending_review`
   * every WWM day carrying money was painted VERIFIED — and `verifiedDays`
   * counted them, so the header read e.g. 6/7 over money one agency had not
   * even issued.
   *
   * `every`, not `some`: the rule the server states where it merges these
   * vouchers ("Day status across vouchers: the WEAKEST wins"), and the same
   * reasoning as `downgraded` below — the strongest possible pill over the
   * weakest possible evidence is what a PR then signs against.
   *
   * A one-voucher week, and a backend that sends no `vouchers`, both fall back
   * to the headline — where it IS the only voucher and the old test was right.
   */
  const rows = week.vouchers ?? [];
  const verified =
    rows.length > 0
      ? rows.every((v) => !!v.status && VERIFIED_STATUSES.includes(v.status))
      : week.status !== null && VERIFIED_STATUSES.includes(week.status);
  // The agency's day-by-day sign-off, which happens DURING the week — long
  // before the voucher's own status moves. Absent (older backend) simply means
  // no day is approved yet, which is what the screen used to assume anyway.
  const approvedDays = new Set(
    (week.dayReviews ?? [])
      .filter((d) => d.status === 'approved')
      .map((d) => d.date),
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
  const reviewed = new Map(
    (week.dayReviews ?? []).map((d) => [d.date, d.status]),
  );
  const downgraded = (iso: string) =>
    reviewed.has(iso) && reviewed.get(iso) !== 'approved';
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
    const sumBucket = (bucket: GridBucket) =>
      dayLines
        .filter((l) => gridBucket(l) === bucket)
        .reduce((s, l) => s + l.commission, 0);
    days.push({
      day: WEEKDAY_ABBR[d.getUTCDay()],
      date: d.getUTCDate(),
      dateIso: iso,
      wages: sumBucket('wages'),
      drinks: sumBucket('drinks'),
      tips: sumBucket('tips'),
      others: sumBucket('others'),
      // Negative, and kept that way — the grid renders the sign. Summing the
      // magnitude here would make the week total add a fine to the pay.
      deductions: sumBucket('deductions'),
      /*
       * A day holding NOTHING BUT fines is SETTLED, not pending.
       *
       * PENDING says "the agency has not looked at this yet", which was flatly
       * untrue of a cancellation fee: the agency computed it, accepted it and
       * pressed Charge — the line only exists BECAUSE that happened. So the
       * screen told a PR to wait on the very people who had already finished,
       * one panel above a penalties card reading "deducted". Checked before the
       * review states because it is not a stage of them.
       *
       * `every`, not `some`: a day with a worked shift AND a fine still has
       * earnings awaiting sign-off, and those outrank it.
       */
      status:
        dayLines.length === 0
          ? 'empty'
          : dayLines.every((l) => gridBucket(l) === 'deductions')
            ? 'deducted'
            : verified && !downgraded(iso)
              ? 'verified'
              : approvedDays.has(iso)
                ? 'approved'
                : 'pending',
    });
  }
  return days;
}
