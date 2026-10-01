import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import type { PrPersonnel } from "@/services/pr-personnel";
import { managedPrFromBackend, prKpiScoreLabel } from "./pr-personnel-map";

/**
 * The KPI on a Manage PR card and profile (owner, 29 Sep 2026): the server's
 * score — a bare number, "—" while there is none — and the agency's own A/B/C
 * grade under its own label, never "KPI".
 *
 * History: every card once read "KPI 0" (28 Sep 2026 audit) because the mapper
 * invented a placeholder 0; the number now comes from GET /pr `kpiScore`, and
 * how it is made stays on the server.
 */
function backendPr(
	fields: { kpiTier?: string | null; kpiScore?: number | null } = {},
): PrPersonnel {
	return {
		id: "pr-1",
		agencyId: "agency-1",
		userId: "pr-1",
		name: "Legal Name",
		nickname: "Nick",
		tier: "tier_1",
		status: "active",
		phone: null,
		email: null,
		icNo: null,
		roster:
			"kpiTier" in fields
				? {
						place: null,
						yearsExp: null,
						kpiTier: fields.kpiTier ?? null,
						payClass: null,
					}
				: null,
		...("kpiScore" in fields ? { kpiScore: fields.kpiScore } : {}),
	} as unknown as PrPersonnel;
}

describe("managedPrFromBackend — the KPI", () => {
	it("carries the server's score", () => {
		expect(managedPrFromBackend(backendPr({ kpiScore: 82 })).kpiScore).toBe(82);
	});

	it("carries null — never an invented 0 — when the server sends none", () => {
		expect(
			managedPrFromBackend(backendPr({ kpiScore: null })).kpiScore,
		).toBeNull();
		// An outlet caller, or a backend predating the score: no key at all.
		expect(managedPrFromBackend(backendPr()).kpiScore).toBeNull();
	});

	it("keeps the agency's grade apart from the score", () => {
		const pr = managedPrFromBackend(backendPr({ kpiTier: "B", kpiScore: 82 }));
		expect(pr.kpiTier).toBe("B");
		expect(pr.kpiScore).toBe(82);
	});
});

describe("prKpiScoreLabel", () => {
	it('shows the score as a bare number — "82"', () => {
		expect(prKpiScoreLabel({ kpiScore: 82 })).toBe("82");
	});

	it("shows a real 0 as 0", () => {
		expect(prKpiScoreLabel({ kpiScore: 0 })).toBe("0");
	});

	it('shows "—", never 0, when there is nothing to score', () => {
		expect(prKpiScoreLabel({ kpiScore: null })).toBe("—");
		expect(prKpiScoreLabel({ kpiScore: undefined })).toBe("—");
		expect(prKpiScoreLabel(managedPrFromBackend(backendPr()))).toBe("—");
	});

	it("never shows the agency's grade in the KPI cell", () => {
		expect(
			prKpiScoreLabel(managedPrFromBackend(backendPr({ kpiTier: "A" }))),
		).toBe("—");
	});
});

describe.each(["en", "zh"] as const)("%s — the labels", (locale) => {
	const t = translations[locale];

	it('the score is labelled "KPI"', () => {
		expect(t.managePr.metricKpi).toBe("KPI");
	});

	it("the agency's grade is not labelled KPI", () => {
		expect(t.managePr.agencyGrade).not.toMatch(/kpi/i);
		expect(t.managePr).not.toHaveProperty("kpiTier");
	});

	it("no portal string explains how the score is made", () => {
		const everything = JSON.stringify(t);
		expect(everything).not.toMatch(
			/punctual|reliab|weighted|weighting|renormal/i,
		);
		expect(everything).not.toMatch(/准时|守时|可靠|权重/);
	});
});
