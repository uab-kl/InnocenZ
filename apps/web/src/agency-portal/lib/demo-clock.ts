import {
	addDays,
	differenceInCalendarDays,
	format,
	parseISO,
	startOfWeek,
} from "date-fns";

/** Original prototype "today" — migrate persisted demo data forward */
export const DEMO_ANCHOR_DATE_ISO = "2026-06-04";
/** Payroll week (Sun–Sat) that contained the prototype anchor */
export const DEMO_ANCHOR_WEEK_SUNDAY_ISO = "2026-05-31";

export function pad2(n: number) {
	return String(n).padStart(2, "0");
}

export function ymdToIso(y: number, m: number, d: number) {
	return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function getLiveTodayYmd(): [number, number, number] {
	const now = new Date();
	return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
}

export function getLiveTodayIso(): string {
	const [y, m, d] = getLiveTodayYmd();
	return ymdToIso(y, m, d);
}

export function getShiftToday(): [number, number, number] {
	return getLiveTodayYmd();
}

/**
 * The Sunday starting the payroll week that contains `fromIso`.
 *
 * THE week of this product: Sunday–Saturday, on the owner's instruction
 * (3 Aug 2026). The backend agrees from the other end — `previousCompleteWeek`
 * and `weekOfDate` in `payment-voucher-week.ts` are Sunday-anchored, the payout
 * cron fires Sunday 02:00, and `backfill-voucher-due-dates.ts` outright REFUSES
 * a `week_start` whose `extract(dow …)` is not 0.
 *
 * Nothing in the app may derive a week any other way. The roster planned in
 * Mon–Sun until 12 Aug 2026, which put its grid columns and its "shifts this
 * week" fairness count on a different seven days from every money screen.
 */
export function getPayrollWeekSundayIso(fromIso = getLiveTodayIso()): string {
	return format(
		startOfWeek(parseISO(fromIso), { weekStartsOn: 0 }),
		"yyyy-MM-dd",
	);
}

export function getPreviousWeekSundayIso(fromIso = getLiveTodayIso()): string {
	return addDaysToIso(getPayrollWeekSundayIso(fromIso), -7);
}

export function addDaysToIso(iso: string, days: number): string {
	return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

export const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

export function weekdayFromIso(iso: string): number {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d).getDay();
}

export function weekdayNameFromIso(iso: string): string {
	return WEEKDAY_NAMES[weekdayFromIso(iso)]!;
}

/** Next calendar date on the given weekday (0=Sun … 6=Sat) from a reference ISO date. */
export function isoOnWeekday(
	fromIso: string,
	weekday: number,
	allowSameDay = false,
): string {
	const todayDow = weekdayFromIso(fromIso);
	let delta = (weekday - todayDow + 7) % 7;
	if (delta === 0 && !allowSameDay) delta = 7;
	return addDaysToIso(fromIso, delta);
}

export function ymdFromIso(iso: string): [number, number, number] {
	const [y, m, d] = iso.split("-").map(Number);
	return [y, m, d];
}

export function weekdayEventName(weekday: number, suffix: string): string {
	return `${WEEKDAY_NAMES[weekday]} ${suffix}`;
}

/** PV issues on the Sunday after a Sun–Sat week ends. */
export function isWeekPvIssuedOnCalendar(
	weekEndIso: string,
	fromIso = getLiveTodayIso(),
): boolean {
	return fromIso >= addDaysToIso(weekEndIso, 1);
}

/** Slide a date from the anchor payroll week onto the live payroll week */
export function remapIsoByWeekSlide(
	iso: string,
	anchorSundayIso = DEMO_ANCHOR_WEEK_SUNDAY_ISO,
): string {
	const dayOffset = differenceInCalendarDays(
		parseISO(iso),
		parseISO(anchorSundayIso),
	);
	const targetSunday = parseISO(getPayrollWeekSundayIso());
	return format(addDays(targetSunday, dayOffset), "yyyy-MM-dd");
}

const ANCHOR_WEEK_END_ISO = "2026-06-06";

/** Move legacy demo dates onto the live calendar */
export function migrateDemoDateIso(iso: string): string {
	if (!iso) return getLiveTodayIso();
	if (iso === DEMO_ANCHOR_DATE_ISO) return getLiveTodayIso();
	if (iso >= DEMO_ANCHOR_WEEK_SUNDAY_ISO && iso <= ANCHOR_WEEK_END_ISO) {
		return remapIsoByWeekSlide(iso);
	}
	return iso;
}

export function migrateDemoYmd(
	date: [number, number, number],
): [number, number, number] {
	const iso = migrateDemoDateIso(ymdToIso(date[0], date[1], date[2]));
	const [y, m, d] = iso.split("-").map(Number);
	return [y, m, d];
}
