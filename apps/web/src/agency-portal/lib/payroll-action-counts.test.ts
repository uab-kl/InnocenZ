import { describe, expect, it } from "vitest";
import {
	countPvsNeedingAction,
	countReceiptsNeedingAction,
	payrollWeekWork,
	pvNeedsAgencyAction,
	voucherIdsWithOpenDispute,
} from "./payroll-action-counts";

const NO_OPEN_DISPUTES: ReadonlySet<string> = new Set();

describe("pvNeedsAgencyAction", () => {
	it("counts a voucher nobody has reviewed", () => {
		expect(pvNeedsAgencyAction("PENDING_REVIEW")).toBe(true);
	});

	it("counts a signed voucher — the money has not left yet", () => {
		expect(pvNeedsAgencyAction("SIGNED")).toBe(true);
	});

	it("counts a disputed voucher", () => {
		expect(pvNeedsAgencyAction("DISPUTED")).toBe(true);
	});

	it("does NOT count a sent voucher — that one waits on the PR", () => {
		expect(pvNeedsAgencyAction("SENT")).toBe(false);
	});

	it("does NOT count a paid voucher", () => {
		expect(pvNeedsAgencyAction("PAID")).toBe(false);
	});
});

describe("countPvsNeedingAction", () => {
	it("counts only the outstanding ones, not the week's whole list", () => {
		const week = [
			{ id: "a", status: "PENDING_REVIEW" as const },
			{ id: "b", status: "SENT" as const },
			{ id: "c", status: "SIGNED" as const },
			{ id: "d", status: "PAID" as const },
			{ id: "e", status: "DISPUTED" as const },
		];

		expect(week).toHaveLength(5);
		expect(countPvsNeedingAction(week, NO_OPEN_DISPUTES)).toBe(3);
	});

	it("is 0 on a settled week", () => {
		expect(
			countPvsNeedingAction(
				[
					{ id: "a", status: "PAID" },
					{ id: "b", status: "PAID" },
				],
				NO_OPEN_DISPUTES,
			),
		).toBe(0);
	});

	// The whole reason the second argument exists: the dispute term already
	// counts this voucher, and the week tab sums both terms.
	it("does NOT count a disputed voucher whose claim is in the dispute queue", () => {
		expect(
			countPvsNeedingAction(
				[{ id: "pv1", status: "DISPUTED" }],
				voucherIdsWithOpenDispute([{ voucherId: "pv1" }]),
			),
		).toBe(0);
	});

	// ...and the case that stops the fix from hiding work: resolving the last
	// claim hands a voucher back to "sent", so DISPUTED with an empty queue is a
	// voucher the system believes is contested with nothing left contesting it.
	it("DOES count a disputed voucher with no open claim of its own", () => {
		expect(
			countPvsNeedingAction(
				[{ id: "pv1", status: "DISPUTED" }],
				voucherIdsWithOpenDispute([{ voucherId: "pv2" }]),
			),
		).toBe(1);
	});

	// A claim can be open against a voucher still at SENT — that voucher waits on
	// the PR, so it is not counted here whatever its claims, and the claim itself
	// is counted by the dispute term.
	it("leaves a SENT voucher uncounted even when it carries an open claim", () => {
		expect(
			countPvsNeedingAction(
				[{ id: "pv1", status: "SENT" }],
				voucherIdsWithOpenDispute([{ voucherId: "pv1" }]),
			),
		).toBe(0);
	});
});

describe("countReceiptsNeedingAction", () => {
	it("counts pending receipts only", () => {
		expect(
			countReceiptsNeedingAction([
				{ status: "pending" },
				{ status: "approved" },
				{ status: "verified" },
				{ status: "pending" },
			]),
		).toBe(2);
	});

	it("is 0 when every receipt has been decided", () => {
		expect(
			countReceiptsNeedingAction([
				{ status: "approved" },
				{ status: "verified" },
			]),
		).toBe(0);
	});
});

describe("payrollWeekWork", () => {
	it("totals the four sub-tab numbers — the week tab cannot disagree with them", () => {
		const week = payrollWeekWork({
			vouchers: 3,
			receipts: 2,
			disputes: 1,
			overtime: 4,
		});

		expect(week.total).toBe(10);
		expect(week.vouchers + week.receipts + week.disputes + week.overtime).toBe(
			week.total,
		);
	});

	it("is 0 on a week with nothing outstanding", () => {
		expect(
			payrollWeekWork({ vouchers: 0, receipts: 0, disputes: 0, overtime: 0 })
				.total,
		).toBe(0);
	});
});
