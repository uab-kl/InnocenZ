import {
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
	repairTierRatesDailyWageSemantics,
	resolveStandardShiftHours,
} from "@agency-portal/lib/agency-demo";
import type { OutletWorkspaceSettings } from "@agency-portal/lib/outlet-demo";
import type {
	OutletWorkspaceRecord,
	SaveOutletWorkspaceInput,
} from "@/services/outlet-workspace";

/**
 * A tier the backend has NO row for — genuinely empty.
 *
 * ⚠️ Not `BLANK_OUTLET_WORKSPACE.tierRates`, despite the name. That constant is
 * built by `normalizeTierRates`, which ends in `ensureAscendingTierWages` and
 * `ensureDistinctTierCommissions` — so even from an all-zero base it SYNTHESISES
 * a ladder, and "blank" comes back as Tier I = RM 40 with Tier II on 1%
 * commission. Invented numbers, just quieter ones than the Velvet fixture.
 * Caught by `outlet-workspace-map.test.ts`, which failed on exactly that.
 *
 * Those two helpers are right for a workspace being EDITED — a venue's tiers
 * should ascend and differ — and wrong for one that does not exist yet, which
 * has to read as nothing at all.
 */
const UNPRICED_TIER: OutletTierRateSettings = {
	wagePerHour: 0,
	drinkPct: 0,
	happyHourDrinkPct: undefined,
	tipPct: 0,
	tablePct: 0,
	otAfterHours: 6,
	targetSalesRm: undefined,
};

const num = (v: string | null | undefined, fallback = 0): number =>
	v == null || v === "" ? fallback : Number(v);
const optNum = (v: string | null | undefined): number | undefined =>
	v == null ? undefined : Number(v);

/**
 * Map the normalized backend workspace aggregate into the rich demo
 * `OutletWorkspaceSettings` the Workspace screen consumes. `outletName` is
 * carried from the session (the backend workspace row has no name).
 *
 * 🔴 A TIER THE BACKEND HAS NO ROW FOR RENDERS BLANK, NOT "Velvet 23".
 *
 * This started from `DEFAULT_OUTLET_WORKSPACE` — a demo fixture carrying
 * RM 40/50/55/65/80 and 0% on every commission column — so an unpriced tier
 * showed a plausible rate card instead of missing data. A fallback that is
 * indistinguishable from a configured value is worse than an empty state:
 * nobody reports it, because nothing looks wrong.
 *
 * ⚠️ And it does not merely DISPLAY. `workspace.tsx` seeds its draft from this
 * output and PUTs the whole draft, so the next save on any unrelated field
 * writes those numbers into the venue's real `outlet_tier_rate` — the table
 * `resolveTierWages` and `resolveCommissionPcts` price every PR's wage and
 * commission from. The drink-menu half of this file was fixed for exactly that
 * reason; the tier rates are the same bug one field over, on the more expensive
 * column.
 *
 * `BLANK_OUTLET_WORKSPACE` is the empty state the no-demo-data rule already
 * provides: zeros, which read as "not configured yet" and are what the venue
 * must then fill in.
 */
export function workspaceSettingsFromBackend(
	record: OutletWorkspaceRecord,
	outletName: string,
): OutletWorkspaceSettings {
	const tierRates = {} as Record<OutletPrTier, OutletTierRateSettings>;
	for (const tier of OUTLET_PR_TIERS) {
		tierRates[tier] = { ...UNPRICED_TIER };
	}
	for (const row of record.tierRates) {
		if (row.kind !== "tier" || !row.tier) continue;
		const tier = row.tier as OutletPrTier;
		if (!OUTLET_PR_TIERS.includes(tier)) continue;
		tierRates[tier] = {
			wagePerHour: num(row.wagePerHour),
			drinkPct: num(row.drinkPct),
			happyHourDrinkPct: optNum(row.happyHourDrinkPct),
			tipPct: num(row.tipPct),
			// Table commission removed backend-side; keep the demo field at 0.
			tablePct: 0,
			otAfterHours: resolveStandardShiftHours(optNum(row.otAfterHours)),
			targetSalesRm: optNum(row.targetSalesRm),
		};
	}
	const repairedTierRates = repairTierRatesDailyWageSemantics(tierRates);

	const coRow = record.tierRates.find((r) => r.kind === "commission_only");
	const commissionOnlyRates = coRow
		? {
				drinkPct: num(coRow.drinkPct),
				happyHourDrinkPct: optNum(coRow.happyHourDrinkPct),
				tipPct: num(coRow.tipPct),
				targetSalesRm: optNum(coRow.targetSalesRm),
			}
		: // Blank for the same reason as the tiers above.
			{
				drinkPct: 0,
				happyHourDrinkPct: undefined,
				tipPct: 0,
				targetSalesRm: undefined,
			};

	// An empty saved menu is a FACT, not a missing value. This mapper only runs
	// on real backed sessions, and the empty state is reachable on a venue's
	// FIRST save (the backend writes no child rows for an empty list, so the
	// refetch hands back exactly this). Falling back to the Velvet 23 fixture
	// here rendered demo drinks as the venue's own price list — and because
	// workspace.tsx seeds its draft from this output and PUTs the whole draft,
	// the next save on any unrelated field wrote Velvet's prices into the real
	// outlet_drink_menu, with drink commission computed against them. Direct
	// violation of the no-DEFAULT_*-on-real-logins rule.
	const drinkMenu =
		record.drinkMenu.length > 0
			? [...record.drinkMenu]
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((d) => ({
						id: d.slug,
						name: d.name,
						priceRm: num(d.priceRm),
						// ⚠️ Carried VERBATIM, all three values. This used to collapse to
						// `drink ? drink : service`, and because the screen seeds its
						// draft from here and PUTs the whole draft back, the next save on
						// any unrelated field rewrote a venue's `tip` row as a `service` —
						// moving every tip that venue logged afterwards out of `tip_rm`
						// and into `service_sales_rm`. Which of the two LISTS a row draws
						// in is `outletDrinkCategory`'s job, not the wire format's.
						category: d.category,
					}))
			: [];

	const baseTier = repairedTierRates[OUTLET_BASE_TIER];

	return {
		outletName,
		basePayPerHour: baseTier.wagePerHour,
		drinkPct: baseTier.drinkPct,
		tipPct: baseTier.tipPct,
		// Table commission removed backend-side; keep the demo field at 0.
		tablePct: 0,
		otAfterHours: resolveStandardShiftHours(baseTier.otAfterHours),
		tierRates: repairedTierRates,
		commissionOnlyRates,
		perDrinkRm: num(record.perDrinkRm),
		// Per-table price removed backend-side; keep the demo field at 0.
		perTableRm: 0,
		drinkMenu,
		happyHourStart: record.happyHourStart,
		happyHourEnd: record.happyHourEnd,
		happyHourDrinkDiscountPct: record.happyHourDrinkDiscountPct,
	};
}

/** Reverse: flatten the demo workspace settings into the backend save payload. */
export function saveInputFromWorkspaceSettings(
	ws: OutletWorkspaceSettings,
): SaveOutletWorkspaceInput {
	return {
		basePayPerHour: ws.basePayPerHour,
		drinkPct: ws.drinkPct,
		tipPct: ws.tipPct,
		otAfterHours: resolveStandardShiftHours(ws.otAfterHours),
		perDrinkRm: ws.perDrinkRm,
		happyHourStart: ws.happyHourStart,
		happyHourEnd: ws.happyHourEnd,
		happyHourDrinkDiscountPct: ws.happyHourDrinkDiscountPct,
		tierRates: [
			...OUTLET_PR_TIERS.map((tier, i) => {
				const t = ws.tierRates[tier];
				return {
					kind: "tier" as const,
					tier,
					wagePerHour: t.wagePerHour,
					drinkPct: t.drinkPct,
					happyHourDrinkPct: t.happyHourDrinkPct ?? null,
					tipPct: t.tipPct,
					otAfterHours: resolveStandardShiftHours(t.otAfterHours),
					targetSalesRm: t.targetSalesRm ?? null,
					sortOrder: i,
				};
			}),
			{
				kind: "commission_only" as const,
				tier: null,
				wagePerHour: null,
				drinkPct: ws.commissionOnlyRates.drinkPct,
				happyHourDrinkPct: ws.commissionOnlyRates.happyHourDrinkPct ?? null,
				tipPct: ws.commissionOnlyRates.tipPct,
				otAfterHours: null,
				targetSalesRm: ws.commissionOnlyRates.targetSalesRm ?? null,
				sortOrder: OUTLET_PR_TIERS.length,
			},
		],
		drinkMenu: ws.drinkMenu.map((d, i) => ({
			slug: d.id,
			name: d.name,
			priceRm: d.priceRm,
			// Verbatim, for the reason spelled out on the read side above. Only a
			// row that carries no category at all is decided here, and 'service' is
			// what an untagged row has always meant.
			category: d.category ?? ("service" as const),
			sortOrder: i,
		})),
	};
}
