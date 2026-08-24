import { describe, expect, it } from "vitest";
import {
	previousDayIso,
	windowsEffectiveOn,
	windowsOverlapPadded,
} from "./pr-live-status";

describe("previousDayIso", () => {
	it("steps back one day", () => {
		expect(previousDayIso("2026-08-25")).toBe("2026-08-24");
	});

	it("crosses a month boundary", () => {
		expect(previousDayIso("2026-09-01")).toBe("2026-08-31");
	});

	it("crosses a year boundary", () => {
		expect(previousDayIso("2027-01-01")).toBe("2026-12-31");
	});
});

describe("windowsEffectiveOn", () => {
	it("returns the day's own windows unchanged", () => {
		const byDate = new Map([["2026-08-25", ["15:00 - 16:00"]]]);
		expect(windowsEffectiveOn(byDate, "2026-08-25")).toEqual(["15:00 - 16:00"]);
	});

	it("carries an overnight window from the day before, rebased to midnight", () => {
		// The live case, 24 Aug 2026: a 22:00-04:00 booking is stamped with the
		// 24th and occupies the first four hours of the 25th.
		const byDate = new Map([["2026-08-24", ["22:00 - 04:00"]]]);
		expect(windowsEffectiveOn(byDate, "2026-08-25")).toEqual(["00:00 - 04:00"]);
	});

	it("does NOT carry an ordinary window from the day before", () => {
		// THE TRAP. Handing yesterday's windows over raw would appear to work,
		// because `windowsOverlapPadded` tries a +/-1440 shift — and that shift
		// would match yesterday's 10:00-12:00 against today's, inventing a clash
		// out of two different days.
		const byDate = new Map([["2026-08-24", ["10:00 - 12:00"]]]);
		expect(windowsEffectiveOn(byDate, "2026-08-25")).toEqual([]);
	});

	it("does not carry a window that ends exactly at midnight", () => {
		// It reaches the boundary and stops; it occupies none of the next day.
		const byDate = new Map([["2026-08-24", ["22:00 - 00:00"]]]);
		expect(windowsEffectiveOn(byDate, "2026-08-25")).toEqual([]);
	});

	it("puts the carried spill before the day's own windows", () => {
		const byDate = new Map([
			["2026-08-24", ["22:00 - 04:00"]],
			["2026-08-25", ["15:00 - 16:00"]],
		]);
		expect(windowsEffectiveOn(byDate, "2026-08-25")).toEqual([
			"00:00 - 04:00",
			"15:00 - 16:00",
		]);
	});

	it("ignores a label-only slot that carries no window", () => {
		const byDate = new Map([["2026-08-24", ["VIP launch night"]]]);
		expect(windowsEffectiveOn(byDate, "2026-08-25")).toEqual([]);
	});

	it("returns nothing for an absent map", () => {
		expect(windowsEffectiveOn(undefined, "2026-08-25")).toEqual([]);
	});

	it("the carried spill actually refuses the small-hours draft it should", () => {
		// The whole point of the fix: before it, this draft saw no busy window at
		// all and the assign guard refused it later.
		const byDate = new Map([["2026-08-24", ["22:00 - 04:00"]]]);
		const effective = windowsEffectiveOn(byDate, "2026-08-25");
		expect(
			effective.some((w) => windowsOverlapPadded(w, "02:00 - 06:00")),
		).toBe(true);
	});

	it("and still clears a draft that starts well after the spill ends", () => {
		// 04:00 plus the 45-minute travel cooldown = 04:45, so 18:00 is free.
		const byDate = new Map([["2026-08-24", ["22:00 - 04:00"]]]);
		const effective = windowsEffectiveOn(byDate, "2026-08-25");
		expect(
			effective.some((w) => windowsOverlapPadded(w, "18:00 - 22:00")),
		).toBe(false);
	});
});
