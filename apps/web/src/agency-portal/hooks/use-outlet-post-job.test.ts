import { findSlotClashes } from "@agency-portal/lib/shift-slot-clash";
import { describe, expect, it } from "vitest";
import type { Shift } from "@/services/shift";
import type { ShiftAssignment } from "@/services/shift-assignment";
import { bookedShiftsFromBackend, postJobWindows } from "./use-outlet-post-job";

/**
 * POST JOB MISSED OVERNIGHT CLASHES (29 Sep 2026 audit).
 *
 * The composer's clash check is overnight-aware on its own — it lays both
 * shifts on one timeline — but it was only ever handed shifts from TODAY
 * onwards. Last night's 22:00 - 04:00 is filed under yesterday, so a post for
 * 02:00 this morning never met it and only the server's 409 said so.
 */

const TODAY = "2026-09-29";

function shift(partial: Partial<Shift>): Shift {
	return {
		id: "s-1",
		agencyId: "a-1",
		outletId: "o-1",
		shiftDate: TODAY,
		slot: "22:00 - 04:00",
		eventName: "Late lounge",
		eventKind: "normal",
		languages: null,
		quantity: 2,
		filled: 0,
		preferredRating: null,
		payPerHour: "0",
		estimatedCost: "0",
		liveSales: "0",
		status: "confirmed",
		createdAt: "",
		updatedAt: "",
		createdBy: "",
		updatedBy: "",
		...partial,
	};
}

describe("postJobWindows", () => {
	it("reads a day either side, but caps count from today", () => {
		expect(postJobWindows(TODAY)).toEqual({
			fetchFrom: "2026-09-28",
			fetchTo: "2027-01-28",
			capFrom: "2026-09-29",
			capTo: "2027-01-27",
		});
	});
});

describe("bookedShiftsFromBackend + the clash check", () => {
	const lastNight = shift({ id: "yesterday", shiftDate: "2026-09-28" });
	const booked = bookedShiftsFromBackend({
		shifts: [lastNight],
		assignments: [],
		outletName: "Emhub",
	});

	it("catches a morning post against last night's overnight shift", () => {
		const clash = findSlotClashes(
			[{ dateIso: TODAY, shift: "02:00 - 05:00", event: "Early" }],
			booked,
		)[0];
		expect(clash?.kind).toBe("overlap");
		expect(clash?.against.dateIso).toBe("2026-09-28");
	});

	it("keeps that same shift OUT of the day caps", () => {
		const { capFrom, capTo } = postJobWindows(TODAY);
		const capped = booked.filter(
			(s) => s.dateIso >= capFrom && s.dateIso <= capTo,
		);
		expect(capped).toEqual([]);
	});

	it("counts only live bookings against the named-PR cap", () => {
		const rows = bookedShiftsFromBackend({
			shifts: [shift({ id: "tonight" })],
			assignments: [
				{ shiftId: "tonight", prId: "p-1", status: "assigned" },
				{ shiftId: "tonight", prId: "p-2", status: "cancelled" },
				{ shiftId: "other", prId: "p-3", status: "assigned" },
			] as ShiftAssignment[],
			outletName: "Emhub",
		});
		expect(rows[0]?.requestedPrIds).toEqual(["p-1"]);
		expect(rows[0]?.shift).toBe("22:00 - 04:00");
	});
});
