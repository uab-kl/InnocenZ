import { describe, expect, it } from "vitest";
import { nextFutureWeeklyBilling } from "./agency-next-billing";

/**
 * 22 Oct 2026: the Subscription hero said "Next billing date 18 Oct 2026".
 * The date shown must be today or later, on the same weekday.
 */

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (d: Date | null) =>
	d
		? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
		: null;

describe("nextFutureWeeklyBilling", () => {
	const today = new Date(2026, 9, 22, 15, 30); // Thu 22 Oct 2026, afternoon

	it("steps a past Sunday to the next one", () => {
		expect(iso(nextFutureWeeklyBilling(day(2026, 10, 18), today))).toBe(
			"2026-10-25",
		);
	});

	it("steps several missed weeks at once, keeping the weekday", () => {
		const next = nextFutureWeeklyBilling(day(2026, 8, 9), today);
		expect(iso(next)).toBe("2026-10-25");
		expect(next?.getDay()).toBe(0);
	});

	it("keeps a date that is still ahead", () => {
		expect(iso(nextFutureWeeklyBilling(day(2026, 10, 25), today))).toBe(
			"2026-10-25",
		);
	});

	it("keeps TODAY — billing today is not in the past", () => {
		expect(iso(nextFutureWeeklyBilling(day(2026, 10, 22), today))).toBe(
			"2026-10-22",
		);
	});

	it("is null for nothing, or a date that is not one", () => {
		expect(nextFutureWeeklyBilling(null, today)).toBeNull();
		expect(nextFutureWeeklyBilling(new Date("nope"), today)).toBeNull();
	});
});
