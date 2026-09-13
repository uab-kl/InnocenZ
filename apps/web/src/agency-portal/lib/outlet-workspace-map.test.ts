import { describe, expect, it } from "vitest";
import type { OutletWorkspaceRecord } from "@/services/outlet-workspace";
import { workspaceSettingsFromBackend } from "./outlet-workspace-map";

/**
 * The no-demo-data-on-a-real-session rule, on the most expensive column there
 * is. A tier the backend has no row for used to fall back to
 * `DEFAULT_OUTLET_WORKSPACE` — the Velvet 23 fixture, RM 40/50/55/65/80 — which
 * renders as a plausible rate card rather than as missing data.
 *
 * It does not merely display: `workspace.tsx` seeds its draft from this output
 * and PUTs the whole draft, so the next save writes those numbers into the
 * venue's real `outlet_tier_rate`, which is what every PR wage and commission is
 * priced from. The drink-menu half of this file was fixed for that reason; these
 * cover the tier half so it cannot come back a third time.
 */
const emptyRecord: OutletWorkspaceRecord = {
	basePayPerHour: "0",
	drinkPct: "0",
	tipPct: "0",
	otAfterHours: "6",
	perDrinkRm: "0",
	happyHourStart: "",
	happyHourEnd: "",
	happyHourDrinkDiscountPct: 0,
	tierRates: [],
	drinkMenu: [],
} as unknown as OutletWorkspaceRecord;

describe("workspaceSettingsFromBackend — no rows means BLANK, not Velvet 23", () => {
	it("gives an unpriced tier a zero wage, not the fixture's RM 40-80", () => {
		const ws = workspaceSettingsFromBackend(emptyRecord, "Blossom Palace");
		for (const [tier, rate] of Object.entries(ws.tierRates)) {
			expect(rate.wagePerHour, `${tier} wage`).toBe(0);
		}
	});

	it("gives an unpriced tier zero commission, so nothing is invented", () => {
		const ws = workspaceSettingsFromBackend(emptyRecord, "Blossom Palace");
		for (const [tier, rate] of Object.entries(ws.tierRates)) {
			expect(rate.drinkPct, `${tier} drink%`).toBe(0);
			expect(rate.tipPct, `${tier} tip%`).toBe(0);
		}
	});

	it("never carries the demo venue's name through", () => {
		const ws = workspaceSettingsFromBackend(emptyRecord, "Blossom Palace");
		expect(ws.outletName).toBe("Blossom Palace");
		expect(JSON.stringify(ws)).not.toContain("Velvet 23");
	});

	it("leaves the drink menu empty rather than seeding demo drinks", () => {
		const ws = workspaceSettingsFromBackend(emptyRecord, "Blossom Palace");
		expect(ws.drinkMenu).toEqual([]);
	});

	it("still maps a REAL tier row through unchanged", () => {
		// The fallback must not swallow configured values.
		const withTier = {
			...emptyRecord,
			tierRates: [
				{
					kind: "tier",
					tier: "Tier I",
					wagePerHour: "500.00",
					drinkPct: "10.00",
					happyHourDrinkPct: "5.00",
					tipPct: "15.00",
					otAfterHours: "6",
					targetSalesRm: null,
				},
			],
		} as unknown as OutletWorkspaceRecord;
		const ws = workspaceSettingsFromBackend(withTier, "JK House");
		expect(ws.tierRates["Tier I"].drinkPct).toBe(10);
		expect(ws.tierRates["Tier I"].tipPct).toBe(15);
	});
});
