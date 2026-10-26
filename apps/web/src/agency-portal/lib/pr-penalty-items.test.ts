import { describe, expect, it } from "vitest";
import type {
	PenaltyProposal,
	UnchargedCancellation,
	UnchargedPenalty,
} from "@/services/agency-uncharged";
import { prPenaltyItems, prPenaltyTotalRm } from "./pr-penalty-items";

/**
 * Manage PR → profile penalties read demo-only fields, so a real session always
 * said none. These are the rows Payroll reads, cut to ONE PR.
 */

const PR = "pr-user-1";
const OTHER = "pr-user-2";

const proposal = (over: Partial<PenaltyProposal> = {}): PenaltyProposal => ({
	prId: PR,
	prName: "Vicky",
	ruleType: "late_per_week",
	weekStart: "2026-10-18",
	weekEnd: "2026-10-24",
	fineRm: "20.00",
	detail: "Late 3 times this week",
	sealed: false,
	...over,
});

const charge = (over: Partial<UnchargedPenalty> = {}): UnchargedPenalty => ({
	chargeId: "c1",
	prId: PR,
	prName: "Vicky",
	ruleType: "min_shifts_per_week",
	weekStart: "2026-10-11",
	weekEnd: "2026-10-17",
	fineRm: "50.00",
	detail: "1 of 3 shifts",
	sealedAt: "2026-10-18T02:00:00.000Z",
	...over,
});

const cancellation = (
	over: Partial<UnchargedCancellation> = {},
): UnchargedCancellation => ({
	assignmentId: "a1",
	prId: PR,
	userId: PR,
	prName: "Vicky",
	shiftDate: "2026-10-16",
	slot: "21:00–03:00",
	outletName: "Velvet 23",
	dailyWageRm: "250.00",
	feeRm: "125.00",
	feePct: 50,
	noticeHours: "6",
	reason: null,
	cancelledAt: "2026-10-16T07:00:00.000Z",
	...over,
});

describe("prPenaltyItems", () => {
	it("keeps only this PR's rows, from all three sources", () => {
		const items = prPenaltyItems(PR, {
			proposals: [proposal(), proposal({ prId: OTHER })],
			penalties: [charge(), charge({ chargeId: "c2", prId: OTHER })],
			cancellations: [
				cancellation(),
				cancellation({ assignmentId: "a2", prId: OTHER, userId: OTHER }),
			],
		});
		expect(items.map((i) => i.key)).toEqual([
			"proposal-late_per_week-2026-10-18",
			"charge-c1",
			"cancel-a1",
		]);
	});

	it("does not count a recorded proposal twice — the charge row is it", () => {
		const items = prPenaltyItems(PR, {
			proposals: [proposal({ sealed: true, ruleType: "min_shifts_per_week" })],
			penalties: [charge()],
			cancellations: [],
		});
		expect(items).toHaveLength(1);
		expect(items[0].recorded).toBe(true);
	});

	it("marks a finding as not recorded and a charge or fee as recorded", () => {
		const items = prPenaltyItems(PR, {
			proposals: [proposal()],
			penalties: [charge()],
			cancellations: [cancellation()],
		});
		expect(items.map((i) => i.recorded)).toEqual([false, true, true]);
	});

	it("matches a cancellation by its user id too, and skips one with no fee", () => {
		const items = prPenaltyItems(PR, {
			proposals: [],
			penalties: [],
			cancellations: [
				cancellation({ prId: null }),
				cancellation({ assignmentId: "a3", feeRm: "0.00" }),
				cancellation({ assignmentId: "a4", feeRm: null }),
			],
		});
		expect(items.map((i) => i.key)).toEqual(["cancel-a1"]);
		expect(items[0]).toMatchObject({
			ruleType: "cancellation",
			shiftDate: "2026-10-16",
			outletName: "Velvet 23",
			detail: null,
		});
	});

	it("is empty for a PR with nothing owed", () => {
		expect(
			prPenaltyItems(OTHER, {
				proposals: [proposal()],
				penalties: [charge()],
				cancellations: [cancellation()],
			}),
		).toEqual([]);
	});
});

describe("prPenaltyTotalRm", () => {
	it("sums in cents", () => {
		const items = prPenaltyItems(PR, {
			proposals: [proposal({ fineRm: "0.10" })],
			penalties: [charge({ fineRm: "0.20" })],
			cancellations: [],
		});
		expect(prPenaltyTotalRm(items)).toBe(0.3);
	});
});
