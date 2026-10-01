import { describe, expect, it } from "vitest";
import {
	cutlostLossChipRm,
	cutlostRequestedAtLabel,
	cutlostShiftDateLabel,
	toPendingCutlostRequest,
} from "./outlet-cutlost-requests";

/**
 * The cut-loss pane on the agency Approvals page (28 Sep 2026 audit): its
 * times printed as raw UTC and its chip read "Cutlost RM 0" on every live row.
 * The row below has the shape of `innocenz-test`'s cut-loss requests.
 */
const LIVE = toPendingCutlostRequest({
	id: "req-1",
	shiftId: "shift-1",
	kind: "cut_slots",
	status: "pending",
	slotsCut: 1,
	estimatedSavings: "55.00",
	rationale: null,
	declineReason: null,
	createdAt: "2026-08-06T08:12:25.416Z",
	outletName: "Venue",
	shiftDate: "2026-08-06",
	slot: "09:00 - 15:00",
	eventName: null,
	releasedAssignments: [],
});

describe("cutlostRequestedAtLabel", () => {
	it("shows a live request's time on the reader's clock, never raw UTC", () => {
		const label = cutlostRequestedAtLabel(LIVE, "en-GB", "Asia/Kuala_Lumpur");
		// 08:12 UTC is 16:12 in Kuala Lumpur.
		expect(label).toContain("16:12");
		expect(label).toContain("Aug");
		expect(label).not.toContain("T08:12");
		expect(label).not.toContain("Z");
	});

	it("passes a demo row's finished label through", () => {
		expect(
			cutlostRequestedAtLabel(
				{ requestedAt: "13 Jul 2026 · 12:40" },
				"en-GB",
				"Asia/Kuala_Lumpur",
			),
		).toBe("13 Jul 2026 · 12:40");
	});
});

describe("cutlostShiftDateLabel", () => {
	it("reads a live YYYY-MM-DD as that calendar day", () => {
		const label = cutlostShiftDateLabel(LIVE.dateLabel, "en-GB");
		expect(label).toContain("6 Aug 2026");
		expect(label).toContain("Thu");
	});

	it("passes a demo label through", () => {
		expect(cutlostShiftDateLabel("Tonight", "en-GB")).toBe("Tonight");
	});
});

describe("cutlostLossChipRm", () => {
	it("leaves the chip out when there is no figure — every live row", () => {
		expect(cutlostLossChipRm(LIVE)).toBeNull();
	});

	it("keeps a real figure", () => {
		expect(cutlostLossChipRm({ cutlostBefore: 1234.4 })).toBe(1234);
	});
});
