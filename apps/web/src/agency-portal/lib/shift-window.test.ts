import { describe, expect, test } from "vitest";
import {
	hasShiftEnded,
	isShiftLiveNow,
	parseSlotRange,
	shiftEndInstant,
	shiftStartInstant,
} from "./shift-window";

/** Local-time Date, matching how a venue reads its own clock. */
const at = (iso: string, h: number, m: number) => {
	const [y, mo, d] = iso.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m, 0, 0);
};

describe("parseSlotRange", () => {
	test("reads a same-day range", () => {
		expect(parseSlotRange("13:00 - 14:00")).toEqual({
			startMin: 780,
			endMin: 840,
		});
	});

	test("carries an overnight range past 1440 instead of wrapping it", () => {
		// 22:00 -> 04:00 next day = 28h past the start day's midnight.
		expect(parseSlotRange("22:00 - 04:00")).toEqual({
			startMin: 1320,
			endMin: 28 * 60,
		});
	});

	test("treats an equal start and end as a full 24 hours, not zero", () => {
		expect(parseSlotRange("22:00 - 22:00")?.endMin).toBe(1320 + 24 * 60);
	});

	test("returns null for anything that is not a time range", () => {
		for (const slot of ["", null, undefined, "Night", "25:00 - 04:00", "9-5"]) {
			expect(parseSlotRange(slot)).toBeNull();
		}
	});
});

describe("shiftEndInstant", () => {
	test("an overnight shift ends on the FOLLOWING calendar day", () => {
		expect(shiftEndInstant("2026-08-10", "22:00 - 04:00")).toEqual(
			at("2026-08-11", 4, 0),
		);
	});

	test("rolls over a month boundary", () => {
		expect(shiftEndInstant("2026-08-31", "22:00 - 04:00")).toEqual(
			at("2026-09-01", 4, 0),
		);
	});

	test("rolls over a year boundary", () => {
		expect(shiftEndInstant("2026-12-31", "20:00 - 02:00")).toEqual(
			at("2027-01-01", 2, 0),
		);
	});

	test("is null when the slot carries no time range", () => {
		expect(shiftEndInstant("2026-08-10", "Night")).toBeNull();
		expect(shiftEndInstant(null, "13:00 - 14:00")).toBeNull();
	});
});

describe("hasShiftEnded", () => {
	const day = "2026-08-10";

	test("hides a same-day shift once its end time passes", () => {
		// The reported bug: 13:00-14:00 still listed at 14:04.
		expect(hasShiftEnded(day, "13:00 - 14:00", at(day, 14, 4))).toBe(true);
	});

	test("keeps a same-day shift that is still running", () => {
		expect(hasShiftEnded(day, "13:00 - 14:00", at(day, 13, 30))).toBe(false);
	});

	test("ends exactly on the boundary", () => {
		expect(hasShiftEnded(day, "13:00 - 14:00", at(day, 14, 0))).toBe(true);
	});

	test("KEEPS an overnight shift that is still running after midnight", () => {
		// The trap: a naive end-time comparison would call this ended at 04:00
		// on the 10th and hide a shift still on the floor.
		expect(hasShiftEnded(day, "22:00 - 04:00", at("2026-08-11", 2, 0))).toBe(
			false,
		);
	});

	test("keeps an overnight shift before it has even started", () => {
		expect(hasShiftEnded(day, "22:00 - 04:00", at(day, 12, 0))).toBe(false);
	});

	test("hides an overnight shift once the next morning passes its end", () => {
		expect(hasShiftEnded(day, "22:00 - 04:00", at("2026-08-11", 4, 30))).toBe(
			true,
		);
	});

	test("hides every shift on a past date", () => {
		expect(hasShiftEnded("2026-08-09", "22:00 - 04:00", at(day, 12, 0))).toBe(
			true,
		);
	});

	test("keeps every shift on a future date", () => {
		expect(hasShiftEnded("2026-08-12", "13:00 - 14:00", at(day, 23, 59))).toBe(
			false,
		);
	});

	test("fails OPEN on an unparseable slot rather than hiding it", () => {
		expect(hasShiftEnded(day, "Night", at("2027-01-01", 12, 0))).toBe(false);
	});
});

describe("shiftStartInstant", () => {
	test("an overnight shift still STARTS on its own calendar day", () => {
		expect(shiftStartInstant("2026-08-10", "22:00 - 04:00")).toEqual(
			at("2026-08-10", 22, 0),
		);
	});

	test("returns null for a slot that is not a time range", () => {
		expect(shiftStartInstant("2026-08-10", "Night")).toBeNull();
	});
});

describe("isShiftLiveNow", () => {
	const day = "2026-08-10";

	test("is live between start and end", () => {
		expect(isShiftLiveNow(day, "13:00 - 14:00", at(day, 13, 30))).toBe(true);
	});

	test("is live at the exact start instant", () => {
		expect(isShiftLiveNow(day, "13:00 - 14:00", at(day, 13, 0))).toBe(true);
	});

	test("is NOT live at the exact end instant — hasShiftEnded owns that minute", () => {
		const end = at(day, 14, 0);
		expect(isShiftLiveNow(day, "13:00 - 14:00", end)).toBe(false);
		expect(hasShiftEnded(day, "13:00 - 14:00", end)).toBe(true);
	});

	test("is not live before it starts", () => {
		expect(isShiftLiveNow(day, "13:00 - 14:00", at(day, 12, 59))).toBe(false);
	});

	test("an overnight shift is live AFTER midnight, on the next calendar day", () => {
		// The whole reason this module exists: 02:00 on the 11th is inside a
		// 22:00-04:00 shift dated the 10th.
		expect(isShiftLiveNow(day, "22:00 - 04:00", at("2026-08-11", 2, 0))).toBe(
			true,
		);
	});

	test("an overnight shift is not live once the next morning passes its end", () => {
		expect(isShiftLiveNow(day, "22:00 - 04:00", at("2026-08-11", 4, 30))).toBe(
			false,
		);
	});

	test("nothing on a past date is live", () => {
		expect(isShiftLiveNow("2026-08-09", "22:00 - 04:00", at(day, 12, 0))).toBe(
			false,
		);
	});

	test("FAILS CLOSED on an unreadable slot, unlike hasShiftEnded", () => {
		expect(isShiftLiveNow(day, "Night", at(day, 23, 0))).toBe(false);
		expect(hasShiftEnded(day, "Night", at(day, 23, 0))).toBe(false);
	});

	test("live and ended are never both true", () => {
		for (const h of [0, 6, 12, 21, 22, 23]) {
			const now = at(day, h, 0);
			const live = isShiftLiveNow(day, "22:00 - 04:00", now);
			const ended = hasShiftEnded(day, "22:00 - 04:00", now);
			expect(live && ended).toBe(false);
		}
	});
});
