import { describe, expect, it } from "vitest";
import { agencyLivePlanLabel } from "@agency-portal/hooks/use-agency-live-plan";
import { translations } from "@/lib/portal-i18n/translations";

const en = translations.en;

describe("agencyLivePlanLabel — the Payroll header names the plan the agency is on", () => {
	it("reads the plan row, as Atlas's live row reads (Starter, RM 125.00 weekly)", () => {
		expect(
			agencyLivePlanLabel(
				{ planName: "Starter", amountRm: 125, billingCycle: "weekly" },
				en,
			),
		).toBe("Starter · RM 125.00/Week");
	});

	it("does not re-price the agency by how many vouchers a tab holds", () => {
		// The demo table would call 6+ PVs "Plus · RM 250.00/Week". The row wins.
		expect(
			agencyLivePlanLabel(
				{ planName: "Starter", amountRm: 125, billingCycle: "weekly" },
				en,
			),
		).not.toContain("Plus");
	});

	it("a negotiated tier with no agreed price says so", () => {
		expect(
			agencyLivePlanLabel(
				{ planName: "Custom", amountRm: 0, billingCycle: "weekly" },
				en,
			),
		).toBe(`Custom · ${en.subscription.priceRenegotiate}`);
	});

	it("an agency with no plan row is told so, never shown a demo plan", () => {
		expect(
			agencyLivePlanLabel(
				{ planName: null, amountRm: null, billingCycle: null },
				en,
			),
		).toBe(en.agencyPv.noActivePlan);
	});

	it("keeps the stored plan name as it is in 中文", () => {
		expect(
			agencyLivePlanLabel(
				{ planName: "Growth", amountRm: 500, billingCycle: "weekly" },
				translations.zh,
			),
		).toBe("Growth · RM 500.00/周");
	});
});
