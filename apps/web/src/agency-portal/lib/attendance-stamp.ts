/**
 * One formatter for every check-in / check-out stamp on screen.
 *
 * A stamp reaches the UI in one of two shapes: the backend sends a full UTC ISO
 * string (`"2026-08-06T06:17:45.947Z"`), the demo store carries a bare local
 * clock time (`"21:45"`). Printing the first one raw is not merely ugly, it is
 * WRONG BY EIGHT HOURS in Malaysia — `04:01Z` is 12:01 pm, so a lunchtime
 * check-in read as a 4am one, and `Out 2026-08-06T06:17:45.947Z` read as an
 * outlet card that had lost its mind.
 *
 * This lived privately inside RosterShiftTable, which is why the fix reached one
 * cell and none of the other four places that print the same field. It is a leaf
 * module on purpose — zero imports, so any component can pull it in without
 * risking the import cycle that once took down the whole agency portal.
 */

/**
 * A stamp as local time — `"12:01 pm"` — with the date prefixed only when the
 * stamp did NOT land on the shift's own date. That case is the one worth
 * noticing: a shift running past midnight, or a PR who checked in a day early.
 *
 * Anything unparseable is returned untouched, which is what keeps the demo
 * store's `"21:45"` rendering as `"21:45"` rather than as a broken date.
 */
export function formatAttendanceStamp(
	stamp: string,
	shiftDateIso?: string,
): string {
	const at = new Date(stamp);
	if (Number.isNaN(at.getTime())) return stamp;

	const time = at.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
	// en-CA gives yyyy-MM-dd, which is the shape dateIso already uses.
	const stampDate = at.toLocaleDateString("en-CA");
	if (!shiftDateIso || stampDate === shiftDateIso) return time;

	const day = at.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});
	return `${day} · ${time}`;
}
