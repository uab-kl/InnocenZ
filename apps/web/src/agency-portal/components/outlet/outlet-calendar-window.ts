/**
 * How far back and ahead the outlet Calendar fetches its shifts.
 *
 * ⚠️ IT FOLLOWS THE MONTH ON SCREEN. The window used to be fixed at today ±90
 * days while the month arrows paged without limit, so any month that reached
 * past the window rendered from whatever part of it had been fetched — Velvet's
 * July showed no 23 Jul shift (confirmed, staffed, completed) once 23 Jul fell
 * 91 days behind today, and nothing on screen said the month was incomplete.
 *
 * Never narrower than the default: today ±90 stays the floor, so paging back to
 * the current month reuses that query's cache instead of asking again.
 */
export const CALENDAR_WINDOW_DAYS = 90;

export interface CalendarVisibleRange {
	/** First day the grid shows — usually a Sunday in the previous month. */
	fromIso: string;
	/** Last day the grid shows — usually a Saturday in the next month. */
	toIso: string;
}

/** Whole days from `fromIso` to `toIso`, in UTC so a DST edge cannot skew it. */
function daysBetween(fromIso: string, toIso: string): number {
	const ms =
		Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
	return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0;
}

export function calendarFetchWindow(input: {
	todayIso: string;
	/** What the grid shows now; null before the calendar has reported it. */
	visible: CalendarVisibleRange | null;
	minDays?: number;
}): { lookbehindDays: number; lookaheadDays: number } {
	const min = input.minDays ?? CALENDAR_WINDOW_DAYS;
	if (!input.visible) return { lookbehindDays: min, lookaheadDays: min };
	return {
		lookbehindDays: Math.max(
			min,
			daysBetween(input.visible.fromIso, input.todayIso),
		),
		lookaheadDays: Math.max(
			min,
			daysBetween(input.todayIso, input.visible.toIso),
		),
	};
}
