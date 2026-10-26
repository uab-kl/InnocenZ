import { describe, expect, it } from "vitest";
import type { CollectionInvoice } from "@/services/collection-invoice";
import {
	checkStatementsByAgency,
	isMismatch,
	newestWeekStatements,
} from "./reconcile-by-agency";

/**
 * THE RECONCILIATION CARD CHECKS EACH AGENCY AGAINST ITS OWN WAGES (22 Oct 2026).
 *
 * It used to check the newest statement — ONE agency's bill — against the
 * venue's wages from EVERY agency, so a venue supplied by two agencies (live:
 * UAB Emhub, Atlas + Why We Met in the week of 7 Sep) would read the second
 * agency's wages as a billing difference the moment either issued a statement.
 */

const ATLAS = "agency-atlas";
const WWM = "agency-why-we-met";

const statement = (over: Partial<CollectionInvoice>): CollectionInvoice => ({
	id: `inv-${over.agencyId ?? ATLAS}-${over.weekStart ?? "2026-09-07"}`,
	agencyId: ATLAS,
	outletId: "outlet-emhub",
	outletName: "UAB Emhub",
	weekStart: "2026-09-07",
	weekEnd: "2026-09-13",
	amount: "500.00",
	currency: "MYR",
	status: "issued",
	issuedAt: null,
	settledAt: null,
	note: null,
	sourceAssignmentIds: [],
	createdAt: "2026-09-14T00:00:00Z",
	updatedAt: "2026-09-14T00:00:00Z",
	aging: "current",
	...over,
});

describe("newestWeekStatements", () => {
	it("keeps every agency's statement for the newest week, and only that week", () => {
		const rows = [
			statement({ agencyId: ATLAS }),
			statement({ agencyId: WWM, amount: "8.33" }),
			statement({
				agencyId: ATLAS,
				weekStart: "2026-08-31",
				weekEnd: "2026-09-06",
			}),
		];
		expect(newestWeekStatements(rows).map((s) => s.agencyId)).toEqual([
			ATLAS,
			WWM,
		]);
	});

	it("is empty with no statements", () => {
		expect(newestWeekStatements([])).toEqual([]);
	});
});

describe("checkStatementsByAgency", () => {
	it("checks each agency's statement against that agency's wages only", () => {
		const checks = checkStatementsByAgency(
			[
				statement({ agencyId: ATLAS }),
				statement({ agencyId: WWM, amount: "8.33" }),
			],
			{
				byAgency: new Map([
					[ATLAS, 500],
					[WWM, 8.33],
				]),
				totalRm: 508.33,
			},
		);
		// Before the split, Atlas's RM 500 faced RM 508.33 and read −RM 8.33.
		expect(checks.map((c) => c.varianceRm)).toEqual([0, 0]);
		expect(checks.some(isMismatch)).toBe(false);
	});

	it("pins a real gap on the agency whose statement has it", () => {
		const checks = checkStatementsByAgency(
			[
				statement({ agencyId: ATLAS, amount: "450.00" }),
				statement({ agencyId: WWM, amount: "8.33" }),
			],
			{
				byAgency: new Map([
					[ATLAS, 500],
					[WWM, 8.33],
				]),
				totalRm: 508.33,
			},
		);
		expect(checks.filter(isMismatch).map((c) => c.statement.agencyId)).toEqual([
			ATLAS,
		]);
		expect(checks[0]?.varianceRm).toBe(-50);
	});

	it("reads a single-agency week exactly as the card always did", () => {
		const [check] = checkStatementsByAgency(
			[statement({ agencyId: ATLAS, amount: "700.00" })],
			{ byAgency: new Map([[ATLAS, 2800]]), totalRm: 2800 },
		);
		expect(check?.ownRecordRm).toBe(2800);
		expect(check?.varianceRm).toBe(-2100);
	});

	it("treats an agency with no wage rows that week as RM 0 on this side", () => {
		const [check] = checkStatementsByAgency(
			[statement({ agencyId: WWM, amount: "8.33" })],
			{
				byAgency: new Map([[ATLAS, 500]]),
				totalRm: 500,
			},
		);
		expect(check?.ownRecordRm).toBe(0);
		expect(check && isMismatch(check)).toBe(true);
	});

	it("falls back to the total for ONE statement when rows carry no agency", () => {
		const [check] = checkStatementsByAgency([statement({ amount: "500.00" })], {
			byAgency: null,
			totalRm: 500,
		});
		expect(check?.varianceRm).toBe(0);
	});

	it("shows nothing for SEVERAL statements when rows carry no agency", () => {
		const checks = checkStatementsByAgency(
			[statement({ agencyId: ATLAS }), statement({ agencyId: WWM })],
			{ byAgency: null, totalRm: 508.33 },
		);
		expect(checks).toEqual([]);
	});

	it("does not call a sub-cent float difference a mismatch", () => {
		const [check] = checkStatementsByAgency([statement({ amount: "0.30" })], {
			byAgency: new Map([[ATLAS, 0.1 + 0.2]]),
			totalRm: 0.1 + 0.2,
		});
		expect(check && isMismatch(check)).toBe(false);
	});
});
