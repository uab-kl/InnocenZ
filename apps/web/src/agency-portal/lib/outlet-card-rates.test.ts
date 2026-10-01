import { describe, expect, it } from "vitest";
import { OUTLET_COMMISSION_RULES } from "./agency-demo";
import { outletHeadlineRates } from "./outlet-card-rates";

/**
 * Manage Outlet quoted "RM 500 · 10% · RM 40–90" on every real venue (28 Sep
 * 2026 audit): the demo Velvet 23 rule, reached because a backed session hands
 * the summaries no commission rules. A real card now reads the venue's own
 * saved base tier, or nothing.
 */
const DEMO_RULE = OUTLET_COMMISSION_RULES[0];

describe("outletHeadlineRates", () => {
	it("quotes the venue's own saved base tier on a real session", () => {
		expect(
			outletHeadlineRates({
				backed: true,
				workspace: { basePayPerHour: 650, drinkPct: 12, tipPct: 20 },
				demoRule: DEMO_RULE,
			}),
		).toEqual({ wage: 650, drinkPct: 12, tipPct: 20 });
	});

	it("says nothing on a real session whose venue has saved no workspace", () => {
		// A 404, a read still in flight and a failed read all arrive as null.
		expect(
			outletHeadlineRates({
				backed: true,
				workspace: null,
				demoRule: DEMO_RULE,
			}),
		).toBeNull();
	});

	it("says nothing when the base tier is unpriced, rather than quoting RM 0", () => {
		expect(
			outletHeadlineRates({
				backed: true,
				workspace: { basePayPerHour: 0, drinkPct: 0, tipPct: 0 },
				demoRule: DEMO_RULE,
			}),
		).toBeNull();
	});

	it("never falls back to the demo rule on a real session", () => {
		const rates = outletHeadlineRates({
			backed: true,
			workspace: null,
			demoRule: DEMO_RULE,
		});
		expect(rates?.wage).not.toBe(DEMO_RULE.wagePerHour);
	});

	it("keeps the demo venue's own rule on a demo session", () => {
		expect(
			outletHeadlineRates({
				backed: false,
				workspace: null,
				demoRule: DEMO_RULE,
			}),
		).toEqual({
			wage: DEMO_RULE.wagePerHour,
			drinkPct: DEMO_RULE.drinkPct,
			tipPct: DEMO_RULE.tipPct,
		});
	});
});
