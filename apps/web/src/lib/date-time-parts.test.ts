import { describe, expect, it } from "vitest";
import { compareNullableKeys, dateTimeParts } from "./date-time-parts";

describe("dateTimeParts", () => {
	/*
	 * THE ONE THAT MATTERS. `payment_voucher.issued_date` is a Postgres `date`
	 * column, so it arrives as "2026-09-29" with no time in it. Running that
	 * through `new Date()` reports midnight UTC — a time nobody recorded — and
	 * in UTC+8 it renders as 8am or, for a value near midnight, as the WRONG
	 * DAY. A date-only value must come back with time null.
	 */
	it("gives a date-only value no time, and never shifts its day", () => {
		const parts = dateTimeParts("2026-09-29");
		expect(parts.date).toBe("29 Sep 2026");
		expect(parts.time).toBeNull();
		expect(parts.minuteOfDay).toBeNull();
	});

	it("splits a real timestamp into both halves", () => {
		const parts = dateTimeParts("2026-08-28T22:52:00");
		expect(parts.date).toBe("28 Aug 2026");
		expect(parts.time).toBe("10:52 pm");
		expect(parts.minuteOfDay).toBe(22 * 60 + 52);
	});

	it("writes midnight and noon as 12, not 0", () => {
		expect(dateTimeParts("2026-08-28T00:05:00").time).toBe("12:05 am");
		expect(dateTimeParts("2026-08-28T12:05:00").time).toBe("12:05 pm");
	});

	it("pads the minute, so 3:03 pm never reads as 3:3 pm", () => {
		expect(dateTimeParts("2026-08-12T15:03:00").time).toBe("3:03 pm");
	});

	/*
	 * The bug the sort keys exist to prevent: ordering on the RENDERED words
	 * puts "28 Aug 2026" before "8 Sep 2026", because "2" sorts before "8".
	 */
	it("orders by day, not by the rendered words", () => {
		const aug28 = dateTimeParts("2026-08-28T10:00:00");
		const sep8 = dateTimeParts("2026-09-08T10:00:00");
		expect(aug28.date.localeCompare(sep8.date)).toBeLessThan(0);
		expect(compareNullableKeys(aug28.dayKey, sep8.dayKey, "asc")).toBeLessThan(
			0,
		);
		expect(
			compareNullableKeys(aug28.dayKey, sep8.dayKey, "desc"),
		).toBeGreaterThan(0);
	});

	it("sorts time of day across different dates", () => {
		// Later date, earlier clock time — sorting by TIME must put it first.
		const lateDateEarlyClock = dateTimeParts("2026-12-01T02:06:00");
		const earlyDateLateClock = dateTimeParts("2026-08-12T15:03:00");
		expect(
			compareNullableKeys(
				lateDateEarlyClock.minuteOfDay,
				earlyDateLateClock.minuteOfDay,
				"asc",
			),
		).toBeLessThan(0);
	});

	it("keeps an empty value out of the way", () => {
		for (const empty of [null, undefined, ""]) {
			const parts = dateTimeParts(empty);
			expect(parts.date).toBe("—");
			expect(parts.dayKey).toBeNull();
		}
	});

	it("shows an unparseable value verbatim rather than hiding it", () => {
		const parts = dateTimeParts("not-a-date");
		expect(parts.date).toBe("not-a-date");
		expect(parts.dayKey).toBeNull();
	});
});

describe("compareNullableKeys", () => {
	// Unknown is not "earliest". Sorting newest-first must not open on blanks.
	it("puts missing keys last in both directions", () => {
		expect(compareNullableKeys(null, 5, "asc")).toBeGreaterThan(0);
		expect(compareNullableKeys(null, 5, "desc")).toBeGreaterThan(0);
		expect(compareNullableKeys(5, null, "asc")).toBeLessThan(0);
		expect(compareNullableKeys(5, null, "desc")).toBeLessThan(0);
		expect(compareNullableKeys(null, null, "asc")).toBe(0);
	});
});
