import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week.js';

/**
 * Billing periods for a subscription — the calendar rule the invoice ledger is
 * generated from.
 *
 * A LEAF module on purpose: it imports the canonical week helper and nothing
 * else, so the repository and the scheduler can both use it without closing an
 * import cycle.
 *
 * Kuala Lumpur is UTC+8 with no DST, so the zone shift is a constant rather than
 * a locale lookup — the same choice `payment-voucher-week.ts` makes, and staying
 * consistent with it is what keeps an agency's billing week identical to its
 * payroll week.
 */
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingPeriod = { periodStart: string; periodEnd: string };

/**
 * How much of one billing period a lane actually HELD — the calendar half of
 * the pro-rata rule; the money half lives in `pro-rata.ts`.
 */
export type PeriodShare = {
  /** The first KL day that is billed: the anchor day inside a lane's first period, else the period's own start. */
  billedFrom: string;
  /** Days from `billedFrom` through the period's last day, both inclusive. */
  billedDays: number;
  /** Days in the whole period, both ends inclusive — 7 for a Sun–Sat week. */
  periodDays: number;
};

/**
 * The KL calendar day an instant falls on.
 *
 * `member_subscription.started_at` is a `timestamptz`, so a subscription created
 * at 00:30 KL on the 1st is stored as 16:30Z on the PREVIOUS day. Reading the
 * UTC day off it would take the monthly anchor as the 31st — precisely the day
 * the month-length clamp then mangles. Shift first, then read.
 */
export function klDayOf(instant: Date): string {
  return new Date(instant.getTime() + KL_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(day: string): { year: number; month: number; date: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const asUtc = new Date(Date.UTC(year, month - 1, date));
  // Round-trip guard: Date.UTC silently rolls 2026-02-30 into March.
  if (asUtc.toISOString().slice(0, 10) !== day) return null;
  return { year, month, date };
}

function addDays(day: string, count: number): string {
  const parts = parseDay(day);
  if (!parts) return day;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.date + count));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The nth month after an anchor, with the day CLAMPED to the target month's
 * length — a subscription started on the 31st bills the 30th/28th in short
 * months and returns to the 31st afterwards.
 *
 * Every period is computed from the ORIGINAL anchor rather than by stepping a
 * date forward repeatedly, which drifts: stepping 31 Jan on by one month lands
 * on 3 Mar. Same rule the outlet's "Renewal 4 Sept 2026" line already uses on
 * the web (`nextRenewalFrom`), ported here so the two cannot disagree.
 */
function monthsAfter(anchor: { year: number; month: number; date: number }, count: number): string {
  const absoluteMonth = anchor.month - 1 + count;
  const year = anchor.year + Math.floor(absoluteMonth / 12);
  const monthIndex = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const date = Math.min(anchor.date, lastDay);
  return new Date(Date.UTC(year, monthIndex, date)).toISOString().slice(0, 10);
}

/** How many months one period of this cycle spans; 0 means "not a month cycle". */
function monthStep(billingCycle: string): number {
  if (billingCycle === 'annually') return 12;
  if (billingCycle === 'monthly') return 1;
  return 0;
}

/**
 * Every billing period this subscription has REACHED, oldest first.
 *
 * Two rules decide what exists, and both are deliberate:
 *
 * 1. **A subscription that ended on or before the KL day it started is never
 *    billed.** That is not a subscription anyone held — it is the trail a plan
 *    switch leaves behind, one row ended and another started within seconds.
 *    Billing it would invent a charge for a plan nobody was on.
 * 2. **Periods are billed in advance** — a period is generated once it has
 *    STARTED, not once it has finished. That is what the outlet's own
 *    "Renewal 4 Sept 2026" line already promises: the next date money is due.
 *
 * `maxPeriods` bounds the loop rather than trusting the dates; a bad `started_at`
 * must not spin here.
 */
export function billingPeriodsFor(params: {
  billingCycle: string;
  startedAt: Date;
  endedAt: Date | null;
  /** KL today, as `klToday()` returns it. */
  today: string;
  maxPeriods?: number;
}): BillingPeriod[] {
  const { billingCycle, startedAt, endedAt, today } = params;
  const maxPeriods = params.maxPeriods ?? 120;

  const startDay = klDayOf(startedAt);
  const endDay = endedAt ? klDayOf(endedAt) : null;
  if (!parseDay(startDay)) return [];
  // Rule 1 — the plan-switch artefact.
  if (endDay !== null && endDay <= startDay) return [];

  // Nothing is billed beyond the day the subscription ended, and nothing is
  // billed into the future.
  const lastDay = endDay !== null && endDay < today ? endDay : today;
  if (startDay > lastDay) return [];

  const periods: BillingPeriod[] = [];
  const step = monthStep(billingCycle);

  if (step === 0) {
    // Weekly — the payroll week, Sun–Sat, from the canonical helper. Not
    // re-derived: a second copy of the anchor rule is how the roster and the
    // payroll lane drifted a day apart once already.
    const first = weekOfDate(startDay);
    if (!first) return [];
    for (let index = 0; index < maxPeriods; index += 1) {
      const periodStart = addDays(first.weekStart, index * 7);
      if (periodStart > lastDay) break;
      periods.push({ periodStart, periodEnd: addDays(periodStart, 6) });
    }
    return periods;
  }

  const anchor = parseDay(startDay);
  if (!anchor) return [];
  for (let index = 0; index < maxPeriods; index += 1) {
    const periodStart = monthsAfter(anchor, index * step);
    if (periodStart > lastDay) break;
    const nextStart = monthsAfter(anchor, (index + 1) * step);
    periods.push({ periodStart, periodEnd: addDays(nextStart, -1) });
  }
  return periods;
}

/** Calendar days from `from` to `to`, BOTH inclusive; 0 when either cannot be read or `to` comes first. */
function daysInclusive(from: string, to: string): number {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end) return 0;
  const span =
    (Date.UTC(end.year, end.month - 1, end.date) - Date.UTC(start.year, start.month - 1, start.date)) /
    DAY_MS;
  return span < 0 ? 0 : span + 1;
}

/**
 * THE SHARE OF A PERIOD THE LANE HELD — owner, 29 Sep 2026: a first partial
 * week is NOT billed in full.
 *
 * The weekly calendar is the payroll week, so `billingPeriodsFor` opens a
 * lane's first period on the SUNDAY of the week its anchor falls in. An agency
 * approved on Friday 7 Aug was therefore billed all of 2–8 Aug at RM 125
 * (INV-000049) for the two days it could actually use. The period itself stays
 * calendar-aligned — its Sunday is the key the ledger dedupes on, and moving it
 * would re-mint every first week already billed — so it is the CHARGE that
 * follows the days held, from the anchor day through the period's last day.
 *
 * Takes the same `startedAt` instant `billingPeriodsFor` is given and reads its
 * KL day the same way, so the two cannot disagree about where a lane starts.
 *
 * Only a period the anchor falls strictly INSIDE is partial. Every later period
 * starts after the anchor, and a monthly or annual period STARTS on its anchor
 * (`monthsAfter` steps from it), so both come back whole — which is why this
 * rule changes nothing for outlets. An unreadable day also comes back whole:
 * the ledger's behaviour before this rule, never a guessed discount.
 */
export function periodShareFor(period: BillingPeriod, startedAt: Date): PeriodShare {
  const periodDays = daysInclusive(period.periodStart, period.periodEnd);
  const whole: PeriodShare = { billedFrom: period.periodStart, billedDays: periodDays, periodDays };
  // Checked before `klDayOf`, which throws on an Invalid Date rather than answering.
  if (periodDays === 0 || !Number.isFinite(startedAt.getTime())) return whole;
  const anchorDay = klDayOf(startedAt);
  if (!parseDay(anchorDay)) return whole;
  if (anchorDay <= period.periodStart || anchorDay > period.periodEnd) return whole;
  return { billedFrom: anchorDay, billedDays: daysInclusive(anchorDay, period.periodEnd), periodDays };
}

/** One row on a billing lane, for the only question asked of it here: when did it hold the lane? */
export type LaneSpan = { startedAt: Date; endedAt: Date | null };

/**
 * Did this row hold the lane at some point in the period? From the KL day it
 * started, up to — not including — the KL day it ended: a row that ended ON a
 * period's first day held none of that period. The one definition of "held",
 * shared by the pricing pick and the share below so the two cannot disagree.
 */
export function spanHoldsPeriod(span: LaneSpan, period: BillingPeriod): boolean {
  return (
    klDayOf(span.startedAt) <= period.periodEnd &&
    (span.endedAt === null || klDayOf(span.endedAt) > period.periodStart)
  );
}

/**
 * HOW MUCH OF A PERIOD A LANE HELD — `null` WHEN IT HELD NONE OF IT (29 Sep
 * 2026 follow-up: "a re-joined billing lane keeps its EARLIEST anchor").
 *
 * A lane walks ONE calendar from its earliest anchor — deliberately, since a
 * second calendar per row is how Emhub was billed two overlapping months. But
 * a lane can be LEFT and later RE-JOINED, and the walk then crosses months in
 * which the org held nothing. Each of those periods was priced `?? latest` —
 * by the plan the org came back on — and billed: agency cd50e9f6 left
 * Enterprise on 30 Jun, came back on Starter on Wed 12 Aug, and the 2 Sep
 * catch-up minted five RM 125 weeks (5 Jul – 8 Aug) for a lane it did not hold
 * (read-only, 29 Sep 2026), then billed the re-join week in full.
 *
 * So, for one period on that calendar:
 *  - no row held any of it                  → `null`: never billed;
 *  - the lane's anchor falls inside it      → `periodShareFor` from the anchor,
 *                                             exactly as before (the first period);
 *  - the lane was held on its FIRST day     → the whole period, billed in
 *                                             advance as every period is;
 *  - held only from a day INSIDE it — the
 *    lane came back after a gap             → billed from that day, like any
 *                                             first period.
 *
 * The same calendar stays: a re-joined month is billed from the re-join day to
 * the end of the calendar month it lands in, and whole from the next — never a
 * second calendar that could overlap a period already billed.
 */
export function lanePeriodShare(
  period: BillingPeriod,
  anchoredAt: Date,
  spans: readonly LaneSpan[],
): PeriodShare | null {
  const holding = spans.filter((span) => spanHoldsPeriod(span, period));
  if (holding.length === 0) return null;

  const fromAnchor = periodShareFor(period, anchoredAt);
  if (fromAnchor.billedDays < fromAnchor.periodDays) return fromAnchor;
  if (holding.some((span) => klDayOf(span.startedAt) <= period.periodStart)) return fromAnchor;

  // Every row that held this period started inside it: the lane came back here.
  const cameBack = holding.reduce((earliest, span) =>
    span.startedAt < earliest.startedAt ? span : earliest,
  );
  return periodShareFor(period, cameBack.startedAt);
}
