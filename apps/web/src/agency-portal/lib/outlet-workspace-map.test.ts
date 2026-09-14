import {
	isOutletTipsRow,
	outletDrinkCategory,
} from "@agency-portal/lib/outlet-demo";
import { describe, expect, it } from "vitest";
import type { OutletWorkspaceRecord } from "@/services/outlet-workspace";
import {
	saveInputFromWorkspaceSettings,
	workspaceSettingsFromBackend,
} from "./outlet-workspace-map";

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

/**
 * JK House's tips row is stored as `category: 'tip'` — a third value the two
 * price LISTS do not name. The mapper used to flatten it to `service` on the
 * way in, and `workspace.tsx` PUTs its whole draft back, so a save on any
 * unrelated field rewrote the row and every tip logged after it was counted as
 * service sales instead of a tip (`shift-sale-from-receipts` buckets on exactly
 * this column). It has to survive both directions untouched.
 */
describe("workspaceSettingsFromBackend — the tip category survives the round-trip", () => {
	const withTips = {
		...emptyRecord,
		drinkMenu: [
			{
				slug: "cosmo",
				name: "Cosmo",
				priceRm: "150.00",
				category: "drink",
				sortOrder: 0,
			},
			{
				slug: "service-1785132698158",
				name: "Tips",
				priceRm: "50.00",
				category: "tip",
				sortOrder: 1,
			},
		],
	} as unknown as OutletWorkspaceRecord;

	it("reads a tip row as 'tip', not as 'service'", () => {
		const ws = workspaceSettingsFromBackend(withTips, "JK House");
		const tips = ws.drinkMenu.find((d) => d.name === "Tips");
		expect(tips?.category).toBe("tip");
	});

	it("shows that row in the SERVICE list all the same", () => {
		const ws = workspaceSettingsFromBackend(withTips, "JK House");
		const tips = ws.drinkMenu.find((d) => d.name === "Tips");
		expect(tips && outletDrinkCategory(tips)).toBe("service");
	});

	it("sends 'tip' back unchanged when the venue saves", () => {
		const ws = workspaceSettingsFromBackend(withTips, "JK House");
		const saved = saveInputFromWorkspaceSettings(ws);
		const tips = saved.drinkMenu?.find((d) => d.name === "Tips");
		expect(tips?.category).toBe("tip");
	});

	it("locks the tips row and nothing else", () => {
		const ws = workspaceSettingsFromBackend(withTips, "JK House");
		expect(ws.drinkMenu.filter(isOutletTipsRow).map((d) => d.name)).toEqual([
			"Tips",
		]);
	});
});
