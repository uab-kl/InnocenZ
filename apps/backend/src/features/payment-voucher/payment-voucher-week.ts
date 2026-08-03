/**
 * Malaysia is UTC+8 and has never observed DST, so a fixed offset is correct
 * here rather than a lazy shortcut — there is no transition for it to get wrong.
 */
const KL_OFFSET_MINUTES = 8 * 60;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The most recently FINISHED Sunday–Saturday, in Kuala Lumpur local time.
 *
 * Sunday-anchored on the owner's instruction (3 Aug 2026) — see `weekBounds()`
 * in payment-voucher.controller.ts for why the Monday anchor was dropped. The
 * payout cron moved to Sunday 02:00 with it, which is also what the "PV issued
 * every Sunday" copy on the PR and agency screens always claimed.
 *
 * The timezone is the whole point of this function existing. The job fires at
 * 02:00 Asia/Kuala_Lumpur, which is 18:00 the **previous day** UTC — so
 * computing the week from UTC calendar fields, as the manual script originally
 * did, still sees the day before and rolls back to the week before the one that
 * just ended. Every voucher would be generated for the wrong seven days.
 *
 * Shifting the instant by the offset and then reading UTC fields off it yields
 * the KL-local calendar date, which is what a shift_date column holds.
 */
export function previousCompleteWeek(ref: Date = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const kl = new Date(ref.getTime() + KL_OFFSET_MINUTES * 60_000);

  const daysSinceSunday = kl.getUTCDay(); // Sun=0 … Sat=6
  const thisSunday = new Date(kl);
  thisSunday.setUTCDate(kl.getUTCDate() - daysSinceSunday);

  const lastSunday = new Date(thisSunday);
  lastSunday.setUTCDate(thisSunday.getUTCDate() - 7);

  const lastSaturday = new Date(lastSunday);
  lastSaturday.setUTCDate(lastSunday.getUTCDate() + 6);

  return { weekStart: isoDate(lastSunday), weekEnd: isoDate(lastSaturday) };
}

/**
 * Today's calendar date in Kuala Lumpur, as a `YYYY-MM-DD` string.
 *
 * The same timezone trap as `previousCompleteWeek`, and it bites in the
 * direction that matters most: a bare `new Date().toISOString()` is a UTC date,
 * so between 00:00 and 08:00 KL local it still reads YESTERDAY. Any rule of the
 * form "has this week finished?" would then answer *no* for the first eight
 * hours of Monday — including 02:00, when the payout job runs — and would hold
 * every voucher that job was about to issue.
 *
 * Comparable with `week_end` by plain string ordering, because ISO dates sort
 * lexicographically.
 */
export function klToday(ref: Date = new Date()): string {
  return isoDate(new Date(ref.getTime() + KL_OFFSET_MINUTES * 60_000));
}

/**
 * The Sunday–Saturday week CONTAINING a given calendar date.
 *
 * Takes a `YYYY-MM-DD` string rather than a Date, and that is the point: a
 * `shift_date` is already a calendar date with no time and no zone, so parsing
 * it into an instant only creates an opportunity to shift it by eight hours. The
 * arithmetic runs on a UTC-anchored Date built from the parts, which cannot
 * drift because midnight UTC never rolls over.
 *
 * Used to place an approved overtime line on the voucher of the week the shift
 * was WORKED — the owner's rule ("sent together with the week PV it originates
 * from"), which is not necessarily the week the approval happens in.
 *
 * Returns null for anything that is not a well-formed date, so a caller cannot
 * quietly place money on the week of `NaN`.
 */
export function weekOfDate(date: string): { weekStart: string; weekEnd: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!match) return null;
  const [, y, m, d] = match;
  const anchor = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(anchor.getTime())) return null;
  // A round trip catches an impossible date that Date.UTC silently rolls over,
  // such as 2026-02-30 becoming 2026-03-02.
  if (isoDate(anchor) !== date) return null;

  const daysSinceSunday = anchor.getUTCDay(); // Sun=0 … Sat=6
  const sunday = new Date(anchor);
  sunday.setUTCDate(anchor.getUTCDate() - daysSinceSunday);
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);

  return { weekStart: isoDate(sunday), weekEnd: isoDate(saturday) };
}
