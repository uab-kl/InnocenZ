import { describe, expect, it } from "vitest";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import {
	canEditDisputedLines,
	canResendToPr,
	canResolveDispute,
	canSendToPr,
	type PvStatus,
} from "@agency-portal/lib/pv-money-actions";

/**
 * THE ONE THING PAYROLL & PV MUST NOT LOSE AGAIN: A DIRECTOR CANNOT TOUCH THE
 * MONEY.
 *
 * Found 12 Sep 2026. "Edit line items", "Resend to PR" and "Resolve dispute"
 * carried NO permission term while every sibling control on the page did, so an
 * agency Director — who reaches this page legitimately on `payment_voucher:read`
 * — was shown all three and the server 403'd each one.
 *
 * ⚠️ THIS USES THE REAL `agencyCan` AND THE REAL GENERATED GRANTS. Nothing is
 * mocked, so if `rbac-grants.generated.ts` is re-synced and a lane's
 * `payment_voucher:create` moves, this test moves with the database instead of
 * agreeing with a stale copy of it. That is the point: the matrix is DERIVED,
 * and a test that mocked the permission would only pin the mock.
 *
 * Why not render `PvDetail`, as OvertimeQueuePanel.test.tsx renders its panel:
 * that component mounts ~20 children with their own data hooks, so the test
 * would mostly assert mocks — and it could not run at all on today's data,
 * because no voucher is in `DISPUTED` status and these controls are gated on
 * BOTH the permission and the status.
 */

/** Bind a lane. No module permissions are passed, so `agencyCan` answers from
 *  the derived lane matrix — which is generated from the live database. */
const can =
	(lane: Parameters<typeof agencyCan>[0]) =>
	(permission: Parameters<typeof agencyCan>[1]) =>
		agencyCan(lane, permission);

const ALL_STATUSES: PvStatus[] = [
	"PENDING_REVIEW",
	"SENT",
	"DISPUTED",
	"SIGNED",
	"PAID",
];

describe("who may act on a voucher's money", () => {
	it("gives the Director nothing, in any state", () => {
		const director = can("agency_director");
		for (const status of ALL_STATUSES) {
			expect(canEditDisputedLines(director, status)).toBe(false);
			expect(canResendToPr(director, status)).toBe(false);
			expect(canResolveDispute(director, status)).toBe(false);
			expect(canSendToPr(director, status)).toBe(false);
		}
	});

	/*
	 * Finance is the lane the owner means by "other member … can help sign the
	 * pv, can edit the disputed shift receipt" (12 Sep 2026). They hold
	 * `payment_voucher:create`, so every one of these is theirs.
	 */
	it("gives Finance the same money actions as the Owner and Guarantor", () => {
		for (const lane of [
			"agency_finance",
			"agency_owner",
			"agency_guarantor",
		] as const) {
			const c = can(lane);
			expect(canEditDisputedLines(c, "DISPUTED")).toBe(true);
			expect(canResolveDispute(c, "DISPUTED")).toBe(true);
			expect(canResendToPr(c, "DISPUTED")).toBe(true);
			expect(canResendToPr(c, "SENT")).toBe(true);
			expect(canSendToPr(c, "PENDING_REVIEW")).toBe(true);
		}
	});

	/*
	 * The status half. A permission alone must never be enough — re-opening a
	 * SIGNED or PAID voucher is what `overrideSignedPv` exists for, and that is a
	 * separate grant.
	 */
	it("refuses even the Owner outside the state each action belongs to", () => {
		const owner = can("agency_owner");
		for (const status of [
			"PENDING_REVIEW",
			"SENT",
			"SIGNED",
			"PAID",
		] as PvStatus[]) {
			expect(canEditDisputedLines(owner, status)).toBe(false);
			expect(canResolveDispute(owner, status)).toBe(false);
		}
		for (const status of ["PENDING_REVIEW", "SIGNED", "PAID"] as PvStatus[]) {
			expect(canResendToPr(owner, status)).toBe(false);
		}
		for (const status of ["SENT", "DISPUTED", "SIGNED", "PAID"] as PvStatus[]) {
			expect(canSendToPr(owner, status)).toBe(false);
		}
	});

	/*
	 * The regression itself, as one assertion: on a DISPUTED voucher — the exact
	 * state the page could not be made to show, because none exists in the
	 * database — Finance gets the three controls and the Director gets none. If
	 * the permission term is ever dropped from the JSX again, whoever drops it
	 * has to delete this line to make the suite pass.
	 */
	it("separates Finance from the Director on a DISPUTED voucher", () => {
		const forLane = (c: ReturnType<typeof can>) => [
			canEditDisputedLines(c, "DISPUTED"),
			canResendToPr(c, "DISPUTED"),
			canResolveDispute(c, "DISPUTED"),
		];
		expect(forLane(can("agency_finance"))).toEqual([true, true, true]);
		expect(forLane(can("agency_director"))).toEqual([false, false, false]);
	});
});
