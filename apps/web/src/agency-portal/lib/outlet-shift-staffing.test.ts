import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { describe, expect, it } from "vitest";
import {
	agencyNameForShift,
	buildShiftStaffRows,
	rosterSlotsForShift,
} from "./outlet-shift-staffing";

/**
 * THE SHIFT SHEET COULD NAME THE WRONG AGENCY (29 Sep 2026 audit, live).
 *
 * Two lookups were loose. The shift's agency came from any slot at the same
 * venue, day and window — so a second shift at the same time (the 17 Aug
 * duplicate) could lend this one its agency. And each PR's agency came from
 * that PR's first slot ANYWHERE in the fetched window, so a PR who worked here
 * through Why We Met last week was labelled Why We Met tonight too.
 */

const ATLAS_ID = "33333333-3333-4333-8333-333333333333";
const WWM_ID = "44444444-4444-4444-8444-444444444444";
const names = new Map([
	[ATLAS_ID, "Atlas Agency"],
	[WWM_ID, "Why We Met"],
]);

function shift(partial: Partial<ShiftRequest>): ShiftRequest {
	return {
		id: "s-a",
		outletName: "UAB Emhub",
		date: "Tonight",
		dateIso: "2026-09-29",
		shift: "11:00 - 12:00",
		quantity: 2,
		filled: 0,
		languages: "",
		event: "Lunch",
		preferredRating: 0,
		estimatedCost: 0,
		liveSales: 0,
		status: "confirmed",
		prs: [],
		payPerHour: 0,
		...partial,
	} as ShiftRequest;
}

function slot(partial: Partial<AgencyRosterSlot>): AgencyRosterSlot {
	return {
		id: "slot",
		prId: "vicky",
		prName: "Vicky",
		outlet: "UAB Emhub",
		date: "2026-09-29",
		dateIso: "2026-09-29",
		shift: "11:00 - 12:00",
		shiftStart: "11:00",
		shiftEnd: "12:00",
		status: "scheduled",
		...partial,
	} as AgencyRosterSlot;
}

describe("agencyNameForShift", () => {
	it("names the agencies the venue SENT the shift to, before anyone is booked", () => {
		const posted = shift({ postedAgencyIds: [ATLAS_ID, WWM_ID] });
		expect(agencyNameForShift(posted, [], "2026-09-29", "", names)).toBe(
			"Atlas Agency, Why We Met",
		);
	});

	it("never borrows the agency of a DIFFERENT shift at the same time", () => {
		const roster = [
			slot({ prId: "vicky", agencyId: ATLAS_ID, agencyName: "Atlas Agency" }),
		];
		const booked = shift({ id: "s-a", prs: ["vicky"] });
		const twin = shift({ id: "s-b", prs: [] });

		expect(agencyNameForShift(booked, roster, "2026-09-29")).toBe(
			"Atlas Agency",
		);
		// It used to answer "Atlas Agency" here too — the twin has nobody on it.
		expect(agencyNameForShift(twin, roster, "2026-09-29")).toBe("");
	});

	it("lists every agency that supplied the shift, once each", () => {
		const roster = [
			slot({ prId: "vicky", agencyId: ATLAS_ID, agencyName: "Atlas Agency" }),
			slot({ prId: "alice", agencyId: WWM_ID, agencyName: "Why We Met" }),
			slot({ prId: "mei", agencyId: ATLAS_ID, agencyName: "Atlas Agency" }),
		];
		const shared = shift({ prs: ["vicky", "alice", "mei"] });
		expect(agencyNameForShift(shared, roster, "2026-09-29")).toBe(
			"Atlas Agency, Why We Met",
		);
	});
});

describe("buildShiftStaffRows", () => {
	it("labels each PR with THIS shift's supplier, not their first slot anywhere", () => {
		const roster = [
			// Last week, through another agency — fetched in the same window.
			slot({
				id: "old",
				prId: "vicky",
				dateIso: "2026-09-22",
				date: "2026-09-22",
				agencyId: WWM_ID,
				agencyName: "Why We Met",
			}),
			slot({
				id: "tonight",
				prId: "vicky",
				agencyId: ATLAS_ID,
				agencyName: "Atlas Agency",
			}),
		];
		const tonight = shift({ prs: ["vicky"] });
		const { booked } = buildShiftStaffRows({
			shift: tonight,
			dateIso: "2026-09-29",
			agencyPRs: [],
			agencyRoster: roster,
			shiftApplicants: [],
			agencyName: "",
		});
		expect(booked[0]?.agencyLabel).toBe("Atlas Agency");
	});

	it("keeps only this shift's own slots", () => {
		const roster = [
			slot({ prId: "vicky" }),
			slot({ prId: "vicky", dateIso: "2026-09-30" }),
			slot({ prId: "someone-else" }),
		];
		expect(
			rosterSlotsForShift(shift({ prs: ["vicky"] }), roster, "2026-09-29"),
		).toHaveLength(1);
	});
});
