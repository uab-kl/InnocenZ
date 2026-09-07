/**
 * WHICH PAYROLL-WEEK TAB DOES A DATED WORK ITEM BELONG TO?
 *
 * One authority for the Payroll screen's week tabs, shared by the sub-tab
 * counts and by the panels those counts sit above. They have to agree: a badge
 * reading 1 over a panel reading none makes the screen look broken rather than
 * empty.
 *
 * A leaf module on purpose — it imports nothing from the portal, so the panels
 * and the route can both reach it without the two importing each other.
 *
 * `includesOlder` is the PAYMENT WEEK, and it is what this module exists for.
 * That tab is already a catch-all for vouchers: `pvBelongsToPayrollWeek` keeps
 * every unpaid voucher there whatever its age, because "a voucher leaves this
 * tab by being paid, never by growing old". The queues beside it were still
 * testing strict containment, so an item older than the oldest tab's window
 * matched NO tab at all — reported 7 Sep 2026: two undecided overtime claims on
 * 20 and 22 Aug (the week of 16–22 Aug) blocked their voucher's send while
 * every Overtime tab read 0, and the panel's own line said "switch weeks above
 * to decide them" naming a week that was not on the strip. Aging out of the
 * queue while the voucher it blocks stays visible is the shape of the bug; the
 * catch-all is the fix the vouchers already had.
 *
 * Containment on `yyyy-MM-dd` strings, so an item sits in exactly one week
 * under the normal rule and can never appear under two.
 */
export function dayBelongsToWeekTab(
	day: string | null | undefined,
	weekStartIso: string,
	weekEndIso: string,
	includesOlder = false,
): boolean {
	if (!day) return false;
	const iso = day.slice(0, 10);
	// Never the FUTURE, whatever the tab: a later week's item belongs to that
	// week's tab, which still exists to hold it.
	if (iso > weekEndIso) return false;
	return includesOlder || iso >= weekStartIso;
}
