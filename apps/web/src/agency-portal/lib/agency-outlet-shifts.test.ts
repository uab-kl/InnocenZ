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

// 15:00 — after the two daytime slots below have ended, before the night one.
const THREE_PM = 15 * 60;

function summarize(shifts: ShiftRequest[], nowMinutes = 0) {
	return buildAgencyOutletSummaries({
		outlets: ["Emhub Testing"],
		shifts,
		roster: [],
		tiedOffers: [],
		todayIso: "2026-08-05",
		nowMinutes,
		commissionRules: [],
	})[0];
}

describe("agency Manage Outlet · available shifts", () => {
	test("lists an outlet-posted shift that the backend stamped confirmed", () => {
		const summary = summarize([CONFIRMED_POST]);
		expect(summary.shifts).toHaveLength(1);
		expect(summary.shifts[0].demandSlots).toBe(6);
		expect(summary.shifts[0].openSlots).toBe(6);
	});

	test("still hides a confirmed post whose headcount is fully filled", () => {
		const filled = {
			...CONFIRMED_POST,
			filled: 6,
			prs: ["a", "b", "c", "d", "e", "f"],
		} as unknown as ShiftRequest;
		expect(summarize([filled]).shifts).toHaveLength(0);
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

	test("drops today's shifts whose window has already ended", () => {
		const night = [
			{ ...CONFIRMED_POST, id: "s1", shift: "10:00 - 12:00" },
			{ ...CONFIRMED_POST, id: "s2", shift: "12:00 - 14:00", quantity: 5 },
			{ ...CONFIRMED_POST, id: "s3", shift: "22:00 - 04:00" },
		] as unknown as ShiftRequest[];

		const summary = summarize(night, THREE_PM);
		expect(summary.shifts.map((s) => s.shift)).toEqual(["22:00 - 04:00"]);
	});

	test("keeps a shift that is running right now", () => {
		const running = [
			{ ...CONFIRMED_POST, id: "s1", shift: "14:00 - 18:00" },
		] as unknown as ShiftRequest[];

		expect(summarize(running, THREE_PM).shifts).toHaveLength(1);
	});

	test("keeps an overnight shift past midnight on the day it starts", () => {
		// 23:00. The window ends at 04:00 tomorrow, so it is not over.
		const overnight = [
			{ ...CONFIRMED_POST, id: "s1", shift: "22:00 - 04:00" },
		] as unknown as ShiftRequest[];

		expect(summarize(overnight, 23 * 60).shifts).toHaveLength(1);
	});

	test("keeps a shift whose time label cannot be parsed", () => {
		const unreadable = [
			{ ...CONFIRMED_POST, id: "s1", shift: "TBC" },
		] as unknown as ShiftRequest[];

		expect(summarize(unreadable, THREE_PM).shifts).toHaveLength(1);
	});

	test("still collapses two sources describing the same time slot", () => {
		const sameSlot = [
			{ ...CONFIRMED_POST, id: "s1", shift: "10:00 PM - 4:00 AM" },
			{ ...CONFIRMED_POST, id: "s2", shift: "10:00 PM  -  4:00 AM" },
		] as unknown as ShiftRequest[];

		expect(summarize(sameSlot).shifts).toHaveLength(1);
	});
});
