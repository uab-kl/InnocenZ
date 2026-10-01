import type { OutletCommissionRule } from "@agency-portal/lib/agency-demo";
import type { OutletWorkspaceSettings } from "@agency-portal/lib/outlet-demo";

/** The three figures a venue's Manage Outlet card and detail header quote. */
export type OutletHeadlineRates = {
	/** The base tier's (Tier I) daily wage — `outlet_tier_rate.daily_wage`. */
	wage: number;
	drinkPct: number;
	tipPct: number;
};

/**
 * What Manage Outlet may say about a venue's pay, or null to say nothing.
 *
 * REAL SESSION: the venue's own base tier, off the workspace it saved — the
 * same `outlet_tier_rate` row `resolveTierWages` prices every PR from. No
 * workspace yet, still loading, a failed read or an unpriced base tier all
 * answer null.
 *
 * ⚠️ NEVER `summary.rule` on a real session. `buildAgencyOutletSummaries` gets
 * no commission rules there, so `getOutletRule` falls back to the first DEMO
 * rule — Velvet 23's RM 500 · 10% — and every real venue's card quoted it, with
 * a tip "range" invented from the wage (8–18% of it) on top.
 *
 * DEMO SESSION: the demo rule, which is that demo venue's rate card.
 */
export function outletHeadlineRates(input: {
	backed: boolean;
	workspace: Pick<
		OutletWorkspaceSettings,
		"basePayPerHour" | "drinkPct" | "tipPct"
	> | null;
	demoRule: Pick<OutletCommissionRule, "wagePerHour" | "drinkPct" | "tipPct">;
}): OutletHeadlineRates | null {
	const { backed, workspace, demoRule } = input;
	if (!backed) {
		return {
			wage: demoRule.wagePerHour,
			drinkPct: demoRule.drinkPct,
			tipPct: demoRule.tipPct,
		};
	}
	if (!workspace || !(workspace.basePayPerHour > 0)) return null;
	return {
		wage: workspace.basePayPerHour,
		drinkPct: workspace.drinkPct,
		tipPct: workspace.tipPct,
	};
}
