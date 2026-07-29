/**
 * Malaysia is UTC+8 and has never observed DST, so a fixed offset is correct
 * here rather than a lazy shortcut — there is no transition for it to get wrong.
 */
const KL_OFFSET_MINUTES = 8 * 60;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The most recently FINISHED Monday–Sunday, in Kuala Lumpur local time.
 *
 * The timezone is the whole point of this function existing. The weekly payout
 * job fires at 02:00 Asia/Kuala_Lumpur on a Monday, which is 18:00 **Sunday**
 * UTC — so computing the week from UTC calendar fields, as the manual script
 * originally did, still sees "Sunday" and rolls back to the week before the one
 * that just ended. Every voucher would be generated for the wrong seven days.
 *
 * Shifting the instant by the offset and then reading UTC fields off it yields
 * the KL-local calendar date, which is what a shift_date column holds.
 */
export function previousCompleteWeek(ref: Date = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const kl = new Date(ref.getTime() + KL_OFFSET_MINUTES * 60_000);

  const daysSinceMonday = (kl.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const thisMonday = new Date(kl);
  thisMonday.setUTCDate(kl.getUTCDate() - daysSinceMonday);

  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);

  return { weekStart: isoDate(lastMonday), weekEnd: isoDate(lastSunday) };
}
