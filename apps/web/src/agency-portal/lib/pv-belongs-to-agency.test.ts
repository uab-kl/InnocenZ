import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { pvBelongsToAgencyPr } from "@agency-portal/lib/agency-payroll";
import { describe, expect, it } from "vitest";

/**
 * The live shape that lost a paid voucher (Atlas Agency, 14 Sep 2026).
 *
 * The roster's `name` is the DISPLAY name the floor uses; `icName` is the legal
 * name, which is what a voucher stores. The two ICs are both real and they
 * disagree — the voucher's copy drifted from the user's own column. Payroll
 * counted two paid vouchers and History listed one, because this predicate
 * could see neither the display name nor the IC.
 */
const VICKY: AgencyManagedPR = {
	id: "pr-vicky",
	name: "Vicky",
	icName: "Victoria Tan Mei Lin",
	ic: "960312-14-8820",
} as AgencyManagedPR;

const ALICE: AgencyManagedPR = {
	id: "pr-alice",
	name: "Alice",
	icName: "Alice Yee Mei Me",
	ic: "A12345678",
} as AgencyManagedPR;

describe("pvBelongsToAgencyPr", () => {
	it("keeps the voucher whose IC matches the roster", () => {
		expect(
			pvBelongsToAgencyPr({ prName: "Alice Yee Mei Me", prIc: "A12345678" }, [
				VICKY,
				ALICE,
			]),
		).toBe(true);
	});

	it("keeps a voucher whose LEGAL name is on the roster under a display name", () => {
		// The regression: IC drifted AND the roster shows "Vicky", so both of the
		// old tests failed and her paid voucher disappeared from History.
		expect(
			pvBelongsToAgencyPr(
				{ prName: "Victoria Tan Mei Lin", prIc: "950312-14-8821" },
				[VICKY, ALICE],
			),
		).toBe(true);
	});

	it("still keeps a voucher that carries the display name", () => {
		expect(pvBelongsToAgencyPr({ prName: "Vicky", prIc: "" }, [VICKY])).toBe(
			true,
		);
	});

	it("does NOT keep another agency's PR", () => {
		expect(
			pvBelongsToAgencyPr(
				{ prName: "Someone Else Entirely", prIc: "111111-11-1111" },
				[VICKY, ALICE],
			),
		).toBe(false);
	});

	it("does not match on a blank legal name", () => {
		const noLegalName = { ...VICKY, icName: "  " } as AgencyManagedPR;
		expect(
			pvBelongsToAgencyPr({ prName: "   ", prIc: "" }, [noLegalName]),
		).toBe(false);
	});
});
