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

export type BillingPeriod = { periodStart: string; periodEnd: string };

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
