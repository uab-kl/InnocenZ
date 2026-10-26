import { describe, expect, it } from "vitest";
import { shiftHasClosed } from "./outlet-shift-ended";

/**
 * AN ENDED SHIFT IS NOT "OPEN FOR APPLICATIONS" (22 Oct 2026: an expired,
 * empty shift read "No PRs booked yet — open for applications").
 */

const at = (iso: string) => new Date(iso);
const base = {
	dateIso: "2026-10-20",
	slot: "22:00 - 04:00",
	status: "open" as const,
	todayIso: "2026-10-22",
};

describe("shiftHasClosed", () => {
	it("is closed once the night's end has passed", () => {
		expect(shiftHasClosed({ ...base, now: at("2026-10-22T12:00:00") })).toBe(
			true,
		);
	});

	it("is still open during an overnight that started yesterday", () => {
		// 20 Oct 22:00 → 21 Oct 04:00; at 21 Oct 01:00 it is live, not past.
		expect(
			shiftHasClosed({
				...base,
				todayIso: "2026-10-21",
				now: at("2026-10-21T01:00:00"),
			}),
		).toBe(false);
	});

	it("is open for a night still to come", () => {
		expect(
			shiftHasClosed({
				...base,
				dateIso: "2026-10-25",
				now: at("2026-10-22T12:00:00"),
			}),
		).toBe(false);
	});

	it("falls back to the calendar day when the slot has no window", () => {
		const now = at("2026-10-22T12:00:00");
		expect(shiftHasClosed({ ...base, slot: "TBC", now })).toBe(true);
		expect(
			shiftHasClosed({ ...base, slot: "TBC", dateIso: "2026-10-22", now }),
		).toBe(false);
	});

	it("is closed once sealed, whatever the clock says", () => {
		expect(
			shiftHasClosed({
				...base,
				dateIso: "2026-10-25",
				status: "sealed",
				now: at("2026-10-22T12:00:00"),
			}),
		).toBe(true);
	});
});
