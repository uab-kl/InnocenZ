import { describe, expect, it } from "vitest";
import { dayBelongsToWeekTab } from "./payroll-week-scope";

// The three tabs as they stood on Mon 7 Sep 2026, the day this was reported.
const THIS_WEEK = { start: "2026-09-06", end: "2026-09-12" };
const LAST_WEEK = { start: "2026-08-30", end: "2026-09-05" };
const PAYMENT_WEEK = { start: "2026-08-23", end: "2026-08-29" };

describe("dayBelongsToWeekTab", () => {
	it("keeps a day inside its own week", () => {
		expect(
			dayBelongsToWeekTab("2026-08-25", PAYMENT_WEEK.start, PAYMENT_WEEK.end),
		).toBe(true);
	});

	it("returns false for a day in another week", () => {
		expect(
			dayBelongsToWeekTab("2026-09-01", PAYMENT_WEEK.start, PAYMENT_WEEK.end),
		).toBe(false);
	});

	it("returns false for a missing day", () => {
		expect(
			dayBelongsToWeekTab(null, PAYMENT_WEEK.start, PAYMENT_WEEK.end),
		).toBe(false);
	});

	it("reads a timestamp by its date part", () => {
		expect(
			dayBelongsToWeekTab(
				"2026-08-25T19:30:00.000Z",
				PAYMENT_WEEK.start,
				PAYMENT_WEEK.end,
			),
		).toBe(true);
	});

	/*
	 * THE 7 SEP 2026 REPORT: two undecided overtime claims worked on 20 and 22
	 * Aug — the week of 16–22 Aug — blocked their voucher's send while every
	 * Overtime tab read 0. No tab reached back that far.
	 */
	it("strands a day older than every tab when no tab catches all", () => {
		for (const week of [THIS_WEEK, LAST_WEEK, PAYMENT_WEEK]) {
			expect(dayBelongsToWeekTab("2026-08-20", week.start, week.end)).toBe(
				false,
			);
			expect(dayBelongsToWeekTab("2026-08-22", week.start, week.end)).toBe(
				false,
			);
		}
	});

	it("puts an aged day on the payment week once it catches all", () => {
		expect(
			dayBelongsToWeekTab(
				"2026-08-20",
				PAYMENT_WEEK.start,
				PAYMENT_WEEK.end,
				true,
			),
		).toBe(true);
		expect(
			dayBelongsToWeekTab(
				"2026-08-22",
				PAYMENT_WEEK.start,
				PAYMENT_WEEK.end,
				true,
			),
		).toBe(true);
	});

	it("still refuses a LATER week's day on the catch-all tab", () => {
		// Last Week and This Week each still have a tab of their own to hold it;
		// letting the payment week claim it would show one item under two tabs.
		expect(
			dayBelongsToWeekTab(
				"2026-09-01",
				PAYMENT_WEEK.start,
				PAYMENT_WEEK.end,
				true,
			),
		).toBe(false);
	});
});
