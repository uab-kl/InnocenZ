import { describe, expect, it } from "vitest";
import type { Shift } from "@/services/shift";
import type { ShiftAssignment } from "@/services/shift-assignment";
import {
	assignmentWageRm,
	createShiftInputFromPost,
	type OutletShiftPostItem,
	rosterSlotsFromBackend,
} from "./backend-shift-map";
import { estimateRosterSlotPayout } from "./portal-sync";
import { rosterWageBillRm } from "./roster-week-plan";

/**
 * THE LINK THAT WAS BROKEN.
 *
 * Dress code was collected in the composer and VALIDATED there (posting refuses
 * an "Other" with no text), and then this mapper dropped it on the floor — its
 * own comment used to say the field was "demo-only". Three screens rendered
 * `shift.dressCode` and never once drew the row, because on a real session the
 * value was always undefined.
 *
 * A green tsc cannot catch that: the type says the field exists, only a test
 * says the mapper COPIES it. Same reason `languages` is asserted alongside —
 * the two travel together and one silently going missing is the whole bug.
 */
const OUTLET_ID = "11111111-1111-4111-8111-111111111111";

function postItem(dressCode?: string): OutletShiftPostItem {
	return {
		dateIso: "2026-08-24",
		shift: "11:00 - 12:00",
		quantity: 6,
		languages: "Cantonese / English / Hokkien",
		dressCode,
		event: "Friday lounge",
		preferredRating: 0,
		estimatedCost: 3000,
		payPerHour: 500,
	};
}

describe("createShiftInputFromPost — the venue's asks", () => {
	it("carries a picked dress code through to the request body", () => {
		expect(
			createShiftInputFromPost(postItem("Black elegant"), OUTLET_ID).dressCode,
		).toBe("Black elegant");
	});

	it("carries the preferred languages alongside it", () => {
		expect(
			createShiftInputFromPost(postItem("Black elegant"), OUTLET_ID).languages,
		).toBe("Cantonese / English / Hokkien");
	});

	it("trims a venue's own Other text rather than dropping it", () => {
		expect(
			createShiftInputFromPost(postItem("  Heels and black tie  "), OUTLET_ID)
				.dressCode,
		).toBe("Heels and black tie");
	});

	it("clips an over-long dress code to the column's 60, so a post cannot 400", () => {
		// The server refuses 61 (zod), and losing a whole shift over a long dress
		// code would be a worse answer than a clipped one.
		expect(
			createShiftInputFromPost(postItem("x".repeat(80)), OUTLET_ID).dressCode,
		).toHaveLength(60);
	});

	it("omits the field entirely when no dress code was given", () => {
		// ABSENT, never "" — an empty string is a value, and every reader gates on
		// truthiness to decide whether to draw a labelled row at all.
		expect(
			createShiftInputFromPost(postItem(undefined), OUTLET_ID).dressCode,
		).toBeUndefined();
		expect(
			createShiftInputFromPost(postItem("   "), OUTLET_ID).dressCode,
		).toBeUndefined();
	});
});

/**
 * THE ROSTER'S MONEY IS EACH BOOKING'S OWN WAGE (28 Sep 2026 audit).
 *
 * The labour estimate was window hours × `shift.pay_per_hour` — and that column
 * holds the Tier I DAILY wage, so a 3-hour slot cost RM 1,500 and a Tier II PR
 * cost exactly what a Tier I did. The live Est. payout also counted a PR on
 * approved leave. The rows below have the shapes `innocenz-test` holds: a
 * 3-hour shift priced at 500, a Tier I booking at 500 and a Tier II booking
 * forecast at 600 (the live Tier II row reads exactly that).
 */
function shiftRow(over: Partial<Shift> = {}): Shift {
	return {
		id: "shift-1",
		agencyId: "agency-1",
		outletId: "outlet-1",
		shiftDate: "2026-09-07",
		slot: "11:00 - 14:00",
		eventName: "Lunch",
		eventKind: "normal",
		languages: null,
		quantity: 3,
		filled: 0,
		preferredRating: 0,
		payPerHour: "500.00",
		estimatedCost: "1500.00",
		liveSales: "0.00",
		status: "confirmed",
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		createdBy: "test",
		updatedBy: "test",
		...over,
	} as Shift;
}

function assignmentRow(over: Partial<ShiftAssignment> = {}): ShiftAssignment {
	return {
		id: "asg-1",
		agencyId: "agency-1",
		shiftId: "shift-1",
		prId: "pr-1",
		status: "assigned",
		payAmount: "500.00",
		checkInAt: null,
		checkOutAt: null,
		notes: null,
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		createdBy: "test",
		updatedBy: "test",
		...over,
	} as ShiftAssignment;
}

describe("assignmentWageRm — what one booking costs", () => {
	it("is the server's pay_amount, per the PR's own tier", () => {
		expect(assignmentWageRm(assignmentRow({ payAmount: "600.00" }))).toBe(600);
	});

	it("is the sealed, earned wage once the shift is completed", () => {
		expect(
			assignmentWageRm(
				assignmentRow({ status: "completed", payAmount: "250.00" }),
			),
		).toBe(250);
	});

	it("is 0 for a booking nobody is paid for, whatever the column still says", () => {
		// A no-show keeps its 500 forecast in pay_amount on the live data.
		for (const status of ["no_show", "cancelled", "leave_approved"] as const) {
			expect(
				assignmentWageRm(assignmentRow({ status, payAmount: "500.00" })),
			).toBe(0);
		}
	});
});

describe("rosterSlotsFromBackend — a slot's payout is its booking's wage", () => {
	const slots = rosterSlotsFromBackend({
		shifts: [shiftRow()],
		assignments: [
			assignmentRow({ id: "tier-1", prId: "pr-1", payAmount: "500.00" }),
			assignmentRow({ id: "tier-2", prId: "pr-2", payAmount: "600.00" }),
			assignmentRow({
				id: "excused",
				prId: "pr-3",
				status: "leave_approved",
				payAmount: "500.00",
			}),
		],
	});
	const byId = new Map(slots.map((s) => [s.id, s]));

	it("prices each tier at its own rate, not hours × the shift's Tier I day rate", () => {
		// The old formula made both of these 3h × 500 = 1,500.
		expect(byId.get("tier-1")?.estPayout).toBe(500);
		expect(byId.get("tier-2")?.estPayout).toBe(600);
		expect(byId.get("tier-2")?.wageRm).toBe(600);
	});

	it("carries nothing for an excused PR", () => {
		expect(byId.get("excused")?.status).toBe("unavailable");
		expect(byId.get("excused")?.wageRm).toBe(0);
	});

	it("feeds the week's wage bill with the tiers' own wages and no markup", () => {
		// 500 + 600, the excused booking adding nothing. Was (1500 + 1500) × 1.08.
		expect(rosterWageBillRm(slots)).toBe(1100);
	});

	it("is what the roster's payout estimate answers, instead of a demo rule", () => {
		const tier2 = byId.get("tier-2");
		expect(tier2 && estimateRosterSlotPayout(tier2)).toBe(600);
	});
});
