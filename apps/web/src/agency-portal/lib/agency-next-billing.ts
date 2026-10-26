/**
 * THE AGENCY'S NEXT BILLING DATE — never one that has already passed.
 *
 * Display only: nothing here decides an amount, a status or a charge.
 *
 * The Subscription hero printed "Next billing date 18 Oct 2026" on 22 Oct. Two
 * reasons, both in what it was given rather than in the ledger:
 *  - it read the DEMO clock's latest PV-issue Sunday on every session, real
 *    ones included — the most recent billing day, i.e. the LAST one; and
 *  - the ledger's own answer ("the day after the latest opened period") is in
 *    the past whenever the weekly bill has not been minted yet.
 *
 * Agencies bill weekly on the Sun–Sat payroll calendar, so a stale date is
 * stepped forward by whole weeks — the same day of the week, the first one that
 * is today or later.
 */

const WEEK_DAYS = 7;
/** A runaway guard — 600 weeks is over eleven years of missed billing. */
const MAX_WEEKS = 600;

export function nextFutureWeeklyBilling(
	next: Date | null | undefined,
	today: Date,
): Date | null {
	if (!next || Number.isNaN(next.getTime())) return null;
	const startOfToday = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);
	let day = new Date(next.getFullYear(), next.getMonth(), next.getDate());
	for (let i = 0; day < startOfToday && i < MAX_WEEKS; i += 1) {
		day = new Date(
			day.getFullYear(),
			day.getMonth(),
			day.getDate() + WEEK_DAYS,
		);
	}
	return day;
}
