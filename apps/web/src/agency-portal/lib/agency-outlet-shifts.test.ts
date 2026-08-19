import { describe, expect, test } from "vitest";
import { buildAgencyOutletSummaries } from "./agency-outlet-shifts";
import type { ShiftRequest } from "./store";

// Reproduces the live Emhub Testing row: an outlet-posted job, which the
// backend stamps `confirmed` on create, with headcount still unfilled.
const CONFIRMED_POST = {
	id: "shift-emhub-1",
	outletName: "Emhub Testing",
	date: "2026-08-05",
	dateIso: "2026-08-05",
	shift: "10p-4a",
	quantity: 6,
	filled: 0,
	languages: "",
	event: "Shift",
	preferredRating: 0,
	estimatedCost: 3000,
	liveSales: 0,
	status: "confirmed",
	prs: [],
	payPerHour: 100,
	destination: "agency",
} as unknown as ShiftRequest;

function summarize(shifts: ShiftRequest[], todayIso = "2026-08-05") {
	return buildAgencyOutletSummaries({
		outlets: ["Emhub Testing"],
		shifts,
		roster: [],
		tiedOffers: [],
		todayIso,
		commissionRules: [],
	})[0];
}

describe("agency Manage Outlet · shifts & staffing", () => {
	test("lists an outlet-posted shift that the backend stamped confirmed", () => {
		const summary = summarize([CONFIRMED_POST]);
		expect(summary.shifts).toHaveLength(1);
		expect(summary.shifts[0].demandSlots).toBe(6);
		expect(summary.shifts[0].openSlots).toBe(6);
	});

	// The list answers TWO questions — what still needs people, and did we fill
	// it — so a met demand has to stay on screen saying 6/6. It used to vanish,
	// which made "fully staffed" and "never posted" both render as nothing.
	test("keeps a fully filled post, showing the demand as met", () => {
		const filled = {
			...CONFIRMED_POST,
			filled: 6,
			prs: ["a", "b", "c", "d", "e", "f"],
		} as unknown as ShiftRequest;

		const summary = summarize([filled]);
		expect(summary.shifts).toHaveLength(1);
		expect(summary.shifts[0].demandSlots).toBe(6);
		expect(summary.shifts[0].suppliedSlots).toBe(6);
		expect(summary.shifts[0].openSlots).toBe(0);
		// …but it is NOT a shift that still needs anyone, and the grid card's
		// "N open shifts" reads this rather than the list length.
		expect(summary.openShiftCount).toBe(0);
		expect(summary.totalOpenSlots).toBe(0);
	});

	test("still hides draft and sealed shifts", () => {
		const draft = { ...CONFIRMED_POST, status: "draft" } as ShiftRequest;
		const sealed = { ...CONFIRMED_POST, status: "sealed" } as ShiftRequest;
		expect(summarize([draft, sealed]).shifts).toHaveLength(0);
	});

	// An outlet runs several distinct shifts a night; all of them must list.
	test("keeps every distinct time slot on the same calendar day", () => {
		const night = [
			{ ...CONFIRMED_POST, id: "s1", shift: "10:00 AM - 12:00 PM" },
			{ ...CONFIRMED_POST, id: "s2", shift: "10:00 PM - 4:00 AM" },
			{ ...CONFIRMED_POST, id: "s3", shift: "12:00 PM - 2:00 PM", quantity: 5 },
		] as unknown as ShiftRequest[];

		const summary = summarize(night);
		expect(summary.shifts).toHaveLength(3);
		// Demand must equal the sum of all three, not just the surviving row.
		expect(summary.totalDemand).toBe(6 + 6 + 5);
	});

	// Was the opposite assertion. A shift that ended this morning is still
	// today's demand, and the section it sits under says "today and future" —
	// dropping it mid-afternoon left the agency unable to see what it staffed.
	test("keeps today's shifts whose window has already ended", () => {
		const day = [
			{ ...CONFIRMED_POST, id: "s1", shift: "10:00 - 12:00" },
			{ ...CONFIRMED_POST, id: "s2", shift: "12:00 - 14:00", quantity: 5 },
			{ ...CONFIRMED_POST, id: "s3", shift: "22:00 - 04:00" },
		] as unknown as ShiftRequest[];

		expect(summarize(day).shifts.map((s) => s.shift)).toEqual([
			"10:00 - 12:00",
			"12:00 - 14:00",
			"22:00 - 04:00",
		]);
	});

	// The date rule is the only one left, and it still ends at yesterday: a
	// finished DAY belongs to History, and the roster's own read-only rules.
	test("drops a shift dated before today", () => {
		expect(summarize([CONFIRMED_POST], "2026-08-06").shifts).toHaveLength(0);
	});

	test("keeps a shift whose time label cannot be parsed", () => {
		const unreadable = [
			{ ...CONFIRMED_POST, id: "s1", shift: "TBC" },
		] as unknown as ShiftRequest[];

		expect(summarize(unreadable).shifts).toHaveLength(1);
	});

	test("still collapses two sources describing the same time slot", () => {
		const sameSlot = [
			{ ...CONFIRMED_POST, id: "s1", shift: "10:00 PM - 4:00 AM" },
			{ ...CONFIRMED_POST, id: "s2", shift: "10:00 PM  -  4:00 AM" },
		] as unknown as ShiftRequest[];

		expect(summarize(sameSlot).shifts).toHaveLength(1);
	});

	// ── CROSS-AGENCY STAFFING ────────────────────────────────────────────────
	// `prs` only ever holds the ids the CALLER's agency can see; since 0124 a
	// shift can be posted to several agencies at once. `suppliedTotal` carries
	// the server's `staffedCount` — everyone on the shift — and must win, or each
	// agency reads its own contribution as the shift's staffing and both keep
	// offering the same seat.
	test("counts supplied from the server total, not the caller's own PR ids", () => {
		const shared = {
			...CONFIRMED_POST,
			quantity: 2,
			// One of the two seats is ours; the other agency filled the other.
			prs: ["mine-1"],
			suppliedTotal: 2,
		} as unknown as ShiftRequest;

		const shift = summarize([shared]).shifts[0];
		expect(shift.demandSlots).toBe(2);
		expect(shift.suppliedSlots).toBe(2);
		expect(shift.openSlots).toBe(0);
	});

	test("falls back to the visible PR ids when the server sent no total", () => {
		const localOnly = {
			...CONFIRMED_POST,
			quantity: 2,
			prs: ["mine-1"],
		} as unknown as ShiftRequest;

		const shift = summarize([localOnly]).shifts[0];
		expect(shift.suppliedSlots).toBe(1);
		expect(shift.openSlots).toBe(1);
	});

	// The per-tier column has the same problem and the same answer: an agency
	// cannot know what tier ANOTHER agency grades its PRs at, so the server's
	// buckets ride through untouched for the tier table to read.
	test("carries the server's per-tier buckets onto the listed shift", () => {
		const shared = {
			...CONFIRMED_POST,
			quantity: 2,
			prs: ["mine-1"],
			suppliedTotal: 2,
			suppliedByTierBucket: { "Tier I": 1, "Tier II": 1 },
		} as unknown as ShiftRequest;

		expect(summarize([shared]).shifts[0].suppliedByTierBucket).toEqual({
			"Tier I": 1,
			"Tier II": 1,
		});
	});
});
