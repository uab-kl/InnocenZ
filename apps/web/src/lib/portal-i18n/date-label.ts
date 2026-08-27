/**
 * Rendered date labels for the portals.
 *
 * ## Read this before pointing anything new at it
 *
 * This module is for DISPLAY ONLY. Several modules in `agency-portal/lib` build
 * strings that LOOK like the ones here and must NOT be routed through it,
 * because their output is stored, parsed or matched. An audit traced every
 * producer; the ones that stay English are marked at their definition, and the
 * short version is:
 *
 * - `pr-demo.MONTH_NAMES` is a parse table (`parsePvIssuedMs`), a sort key, a
 *   payroll-row grouping key, and part of the `paidRefs` duplicate-payment
 *   guard. Its output reaches sessionStorage through the store's `partialize`.
 * - `pr-demo.DAY_NAMES` is read back positionally — `row.dateDisplay.split(" ")[0]`
 *   gates a duplicate-voucher check.
 * - `pr-weekly-payment.WEEKDAY_SHORT` and `agency-payroll-demo-pvs.DAY_NAMES_SHORT`
 *   are persisted on voucher rows and spliced into dispute text that is later
 *   re-read with an English-only regex.
 * - `pv-template.LINE_DAY_MONTHS` prints on the exported PDF, which stays
 *   English by the same decision that keeps the whole voucher document English.
 *
 * Translating any of those rewrites stored records or breaks a parse, silently.
 * The rule is the project's usual one: keep the stored token English and resolve
 * it HERE, at the render.
 *
 * `weekdayLabel` exists for exactly that — it takes the English token a stored
 * row already carries and returns what the reader should see.
 */
import type { PortalLocale } from "./locale-prefs";
import type { PortalTranslations } from "./translations";

const WEEKDAY_KEYS = [
	"weekdaySun",
	"weekdayMon",
	"weekdayTue",
	"weekdayWed",
	"weekdayThu",
	"weekdayFri",
	"weekdaySat",
] as const;

const MONTH_SHORT_KEYS = [
	"monShortJan",
	"monShortFeb",
	"monShortMar",
	"monShortApr",
	"monShortMay",
	"monShortJun",
	"monShortJul",
	"monShortAug",
	"monShortSep",
	"monShortOct",
	"monShortNov",
	"monShortDec",
] as const;

const MONTH_LONG_KEYS = [
	"monLongJanuary",
	"monLongFebruary",
	"monLongMarch",
	"monLongApril",
	"monLongMay",
	"monLongJune",
	"monLongJuly",
	"monLongAugust",
	"monLongSeptember",
	"monLongOctober",
	"monLongNovember",
	"monLongDecember",
] as const;

/** The English token for a weekday index — the value a stored row holds. */
export function englishWeekdayToken(dayIndex: number): string {
	return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIndex] ?? "";
}

/** The English token for a 0-based month — the value a stored row holds. */
export function englishMonthToken(monthIndex: number): string {
	return (
		[
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		][monthIndex] ?? ""
	);
}

/** `0` = Sunday, matching `Date#getDay()` / `getUTCDay()`. */
export function weekdayShortLabel(
	dayIndex: number,
	t: PortalTranslations,
): string {
	const key = WEEKDAY_KEYS[dayIndex];
	return key ? t.dates[key] : "";
}

/**
 * Resolve an English weekday TOKEN ("Sun") that a stored row already carries.
 *
 * Falls through unchanged on anything unrecognised, so a row written under an
 * older convention still renders instead of blanking a cell.
 */
export function weekdayLabel(token: string, t: PortalTranslations): string {
	const trimmed = token.trim();
	const i = WEEKDAY_KEYS.findIndex(
		(_, n) => englishWeekdayToken(n) === trimmed,
	);
	return i === -1 ? token : t.dates[WEEKDAY_KEYS[i]];
}

/** `0` = January, matching `Date#getMonth()`. */
export function monthShortLabel(
	monthIndex: number,
	t: PortalTranslations,
): string {
	const key = MONTH_SHORT_KEYS[monthIndex];
	return key ? t.dates[key] : "";
}

/** `0` = January. The full form, for a month picker. */
export function monthLongLabel(
	monthIndex: number,
	t: PortalTranslations,
): string {
	const key = MONTH_LONG_KEYS[monthIndex];
	return key ? t.dates[key] : "";
}

/**
 * "18 Jul" / "18 7月" — a day with its short month.
 *
 * The ORDER is the same in both languages here, so it is built in code rather
 * than held as a `{d} {mon}` template. A language that reorders it would need a
 * dictionary key instead; add one then, rather than a third convention.
 */
export function dayMonthLabel(
	date: Date,
	t: PortalTranslations,
	utc = false,
): string {
	const d = utc ? date.getUTCDate() : date.getDate();
	const m = utc ? date.getUTCMonth() : date.getMonth();
	return `${d} ${monthShortLabel(m, t)}`;
}

/** The parts of "Sun · 18 Jul". The separator is the caller's. */
export function weekdayDayMonthLabel(
	date: Date,
	t: PortalTranslations,
	utc = false,
): { weekday: string; dayMonth: string } {
	const day = utc ? date.getUTCDay() : date.getDay();
	return {
		weekday: weekdayShortLabel(day, t),
		dayMonth: dayMonthLabel(date, t, utc),
	};
}

/**
 * The BCP-47 tag for `Intl` / `toLocaleDateString`.
 *
 * Several surfaces formatted with a hardcoded `"en-GB"`, which pinned English
 * regardless of the switch, and one used `"default"`, which follows the
 * BROWSER rather than the portal — so a 中文 portal on an en-US browser still
 * read English. Both are wrong for the same reason: the language is the user's
 * portal choice, not the machine's.
 *
 * `en-GB` is kept for English so day-before-month ordering does not change.
 */
export function dateLocaleTag(locale: PortalLocale): string {
	return locale === "zh" ? "zh-CN" : "en-GB";
}
