import { describe, expect, it } from "vitest";
import { pvMatchesSearch } from "@agency-portal/lib/pv-list-filters";

const pv = {
	voucherNo: "PV-000009",
	prName: "Victoria Tan",
	prNickname: "Vicky",
	prIc: "900101-14-5566",
	outlet: "Velvet 23",
};

describe("pvMatchesSearch — the Payroll voucher search", () => {
	it("matches everything when the box is empty", () => {
		expect(pvMatchesSearch(pv, "")).toBe(true);
		expect(pvMatchesSearch(pv, "   ")).toBe(true);
	});

	it("finds a voucher by its printed number, whole or in part", () => {
		expect(pvMatchesSearch(pv, "PV-000009")).toBe(true);
		expect(pvMatchesSearch(pv, "pv-000009")).toBe(true);
		expect(pvMatchesSearch(pv, "000009")).toBe(true);
	});

	it("finds a voucher by the PR's legal name, nickname or printed label", () => {
		expect(pvMatchesSearch(pv, "victoria")).toBe(true);
		expect(pvMatchesSearch(pv, "VICKY")).toBe(true);
		expect(
			pvMatchesSearch(
				{ ...pv, prNickname: undefined },
				"(vk)",
				"(VK) Victoria Tan",
			),
		).toBe(true);
	});

	it("finds a voucher by IC, with or without the dashes", () => {
		expect(pvMatchesSearch(pv, "900101-14")).toBe(true);
		expect(pvMatchesSearch(pv, "900101145566")).toBe(true);
	});

	it("finds a voucher by venue", () => {
		expect(pvMatchesSearch(pv, "velvet")).toBe(true);
	});

	it("does not match what is not there", () => {
		expect(pvMatchesSearch(pv, "PV-000010")).toBe(false);
		expect(pvMatchesSearch(pv, "atlas")).toBe(false);
		// A PV number's digits must not reach into the IC.
		expect(pvMatchesSearch({ ...pv, voucherNo: "PV-000001" }, "PV-14")).toBe(
			false,
		);
	});
});
