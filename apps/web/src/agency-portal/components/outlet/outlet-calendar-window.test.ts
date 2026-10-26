import { describe, expect, it } from "vitest";
import {
	CALENDAR_WINDOW_DAYS,
	calendarFetchWindow,
} from "./outlet-calendar-window";

/**
 * THE CALENDAR FETCHES THE MONTH IT SHOWS (22 Oct 2026: Velvet's July was
 * missing a confirmed 23 Jul shift, because the window was a fixed today − 90
 * days — 24 Jul — while the arrows paged back without limit).
 */

const TODAY = "2026-10-22";

describe("calendarFetchWindow", () => {
	it("keeps the ±90-day default before the grid has reported", () => {
		expect(calendarFetchWindow({ todayIso: TODAY, visible: null })).toEqual({
			lookbehindDays: CALENDAR_WINDOW_DAYS,
			lookaheadDays: CALENDAR_WINDOW_DAYS,
		});
	});

	it("never narrows below the default for the current month", () => {
		// October 2026's grid: Sun 27 Sep → Sat 7 Nov.
		const w = calendarFetchWindow({
			todayIso: TODAY,
			visible: { fromIso: "2026-09-27", toIso: "2026-11-07" },
		});
		expect(w).toEqual({ lookbehindDays: 90, lookaheadDays: 90 });
	});

	it("reaches back far enough to include 23 Jul when July is on screen", () => {
		// July 2026's grid: Sun 28 Jun → Sat 8 Aug.
		const w = calendarFetchWindow({
			todayIso: TODAY,
			visible: { fromIso: "2026-06-28", toIso: "2026-08-08" },
		});
		expect(w.lookbehindDays).toBe(116);
		expect(w.lookaheadDays).toBe(90);
		// The bug in numbers: the old fixed window started on 24 Jul.
		const daysTo23Jul = 91;
		expect(w.lookbehindDays).toBeGreaterThanOrEqual(daysTo23Jul);
	});

	it("reaches forward when a far-future month is on screen", () => {
		// March 2027's grid: Sun 28 Feb → Sat 10 Apr.
		const w = calendarFetchWindow({
			todayIso: TODAY,
			visible: { fromIso: "2027-02-28", toIso: "2027-04-10" },
		});
		expect(w.lookbehindDays).toBe(90);
		expect(w.lookaheadDays).toBe(170);
	});
});
