import { describe, expect, it, vi } from "vitest";

/**
 * ONE PR'S IC NUMBER DIFFERED BETWEEN PAGES (28 Sep 2026 audit).
 *
 * Read-only, 29 Sep: Vicky's `user_profile.id_no` was corrected on 8 Sep, and
 * 8 of her 9 vouchers still carry the old `pr_ic` snapshot. Manage PR and
 * Approvals read the profile; every voucher screen matched her by that copied
 * IC, found no one, and printed the copy. These are synthetic numbers in the
 * same shapes — the fix is that a voucher reaches its PR through `pr_id`.
 */
vi.mock("@/lib/auth/agency-demo-session", () => ({
	getPortalSessionKind: () => "real",
}));

const { rosterPrForVoucher, voucherPayeeIc } = await import("./pv-roster-pr");
const { buildAgencyPayee } = await import("./pv-template");
const { resolvePvPrId, resolvePvPrName, resolvePvPrLabel } = await import(
	"./agency-payroll"
);

const PROFILE_IC = "990101-14-1234";
const STALE_IC = "990101-14-9999";

const vicky = {
	id: "93ea08b0-0000-4000-8000-000000000001",
	name: "Vicky",
	icName: "Victoria Tan",
	ic: PROFILE_IC,
	mobile: "",
} as never;

/** A voucher written BEFORE the profile correction: FK right, copy stale. */
const staleVoucher = {
	id: "pv-2",
	prId: "93ea08b0-0000-4000-8000-000000000001",
	prName: "Victoria Tan",
	prIc: STALE_IC,
	rows: [],
	deduct: 0,
	status: "PAID",
} as never;

describe("rosterPrForVoucher", () => {
	it("finds the PR by the voucher's FK even when the copied IC is stale", () => {
		expect(rosterPrForVoucher(staleVoucher, [vicky])).toBe(vicky);
	});

	it("falls back to the IC copy only for a voucher with no FK", () => {
		expect(rosterPrForVoucher({ prIc: PROFILE_IC } as never, [vicky])).toBe(
			vicky,
		);
		expect(rosterPrForVoucher({ prIc: STALE_IC } as never, [vicky])).toBe(
			undefined,
		);
	});
});

describe("voucherPayeeIc — the IC every voucher screen prints", () => {
	it("is the profile's IC, the one Manage PR shows", () => {
		expect(voucherPayeeIc(staleVoucher, [vicky])).toBe(PROFILE_IC);
	});

	it("keeps the snapshot for a PR no longer on this roster", () => {
		expect(voucherPayeeIc(staleVoucher, [])).toBe(STALE_IC);
	});
});

describe("buildAgencyPayee — the voucher detail's IC and payee code", () => {
	it("prints the profile IC and derives the code from it", () => {
		const payee = buildAgencyPayee(staleVoucher, [vicky]);
		expect(payee.ic).toBe(PROFILE_IC);
		// The code's tail is the IC's last four digits.
		expect(payee.code).toContain("1234");
		expect(payee.code).not.toContain("9999");
	});
});

describe("resolvePvPrName / resolvePvPrLabel — one name per PR (live, 29 Sep)", () => {
	/** Written AFTER the correction: the IC copy is current. */
	const currentVoucher = {
		...(staleVoucher as object),
		id: "pv-3",
		prIc: PROFILE_IC,
		prNickname: "Vicky",
	} as never;
	const staleWithNickname = {
		...(staleVoucher as object),
		prNickname: "Vicky",
	} as never;

	it("names both vouchers by the LEGAL name, never the working name", () => {
		// The IC match used to return the roster's `name` — "Vicky" — for the
		// voucher whose copy was current, and the voucher's own name otherwise.
		expect(resolvePvPrName(currentVoucher, [vicky])).toBe("Victoria Tan");
		expect(resolvePvPrName(staleWithNickname, [vicky])).toBe("Victoria Tan");
	});

	it("a voucher with NO prId, matched by a current IC, is named the same way", () => {
		// Code review, 29 Sep: the IC branch returned the working name.
		const noFk = { prName: "Victoria Tan", prIc: PROFILE_IC } as never;
		expect(resolvePvPrName(noFk, [vicky])).toBe("Victoria Tan");
		expect(resolvePvPrName(noFk, [vicky])).toBe(
			resolvePvPrName(currentVoucher, [vicky]),
		);
	});

	it("prints the same label on both, so the week counts her once", () => {
		const labels = new Set([
			resolvePvPrLabel(currentVoucher, [vicky]),
			resolvePvPrLabel(staleWithNickname, [vicky]),
		]);
		expect([...labels]).toEqual(["(Vicky) Victoria Tan"]);
	});
});

describe("resolvePvPrId — the Paid tab's PR filter", () => {
	it("resolves a stale-IC voucher to its PR through the FK", () => {
		expect(resolvePvPrId(staleVoucher, [vicky])).toBe(
			"93ea08b0-0000-4000-8000-000000000001",
		);
	});
});
