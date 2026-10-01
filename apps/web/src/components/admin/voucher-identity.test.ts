import { describe, expect, it } from "vitest";
import {
	agencySignLine,
	prSignLine,
	voucherNumberLabel,
} from "@/components/admin/voucher-identity";
import { translations } from "@/lib/portal-i18n/translations";

const en = translations.en;
const when = (iso: string) => `at ${iso.slice(0, 10)}`;

const signed = {
	financeHeadName: "Jane Tan",
	financeHeadRole: "Owner",
	financeHeadSignedAt: "2026-09-14T02:02:00.000Z",
	prSignedAt: "2026-09-15T03:30:00.000Z",
};

describe("voucherNumberLabel", () => {
	it("prints the voucher's own number, never the uuid", () => {
		expect(voucherNumberLabel({ voucherNo: "PV-000001" })).toBe("PV-000001");
		expect(voucherNumberLabel({ voucherNo: null })).toBe("—");
		expect(voucherNumberLabel({ voucherNo: "  " })).toBe("—");
	});
});

describe("agencySignLine — who attested it, as what, when", () => {
	it("names the signer, the capacity and the time", () => {
		expect(agencySignLine(signed, en, when)).toBe(
			"Jane Tan · Owner · at 2026-09-14",
		);
	});

	it("follows the language for the capacity", () => {
		expect(agencySignLine(signed, translations.zh, when)).toContain(
			translations.zh.profile.roleOwner,
		);
	});

	it("claims no title for a signature taken before capacities were recorded", () => {
		expect(agencySignLine({ ...signed, financeHeadRole: null }, en, when)).toBe(
			"Jane Tan · at 2026-09-14",
		);
	});

	it("is empty until the agency signs", () => {
		expect(
			agencySignLine({ ...signed, financeHeadSignedAt: null }, en, when),
		).toBeNull();
	});
});

describe("prSignLine", () => {
	it("is the PR's signing time, or nothing yet", () => {
		expect(prSignLine(signed, when)).toBe("at 2026-09-15");
		expect(prSignLine({ ...signed, prSignedAt: null }, when)).toBeNull();
	});
});
