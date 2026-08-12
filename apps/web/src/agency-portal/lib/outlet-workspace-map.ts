import {
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
	repairTierRatesDailyWageSemantics,
	resolveStandardShiftHours,
} from "@agency-portal/lib/agency-demo";
import {
	DEFAULT_OUTLET_WORKSPACE,
	type OutletWorkspaceSettings,
} from "@agency-portal/lib/outlet-demo";
import type {
	OutletWorkspaceRecord,
	SaveOutletWorkspaceInput,
} from "@/services/outlet-workspace";

const num = (v: string | null | undefined, fallback = 0): number =>
	v == null || v === "" ? fallback : Number(v);
const optNum = (v: string | null | undefined): number | undefined =>
	v == null ? undefined : Number(v);

/**
 * Map the normalized backend workspace aggregate into the rich demo
 * `OutletWorkspaceSettings` the Workspace screen consumes. Starts from
 * `DEFAULT_OUTLET_WORKSPACE` so any part the backend has no row for keeps a
 * sensible default. `outletName` is carried from the session (the backend
 * workspace row has no name).
 */
export function workspaceSettingsFromBackend(
	record: OutletWorkspaceRecord,
	outletName: string,
): OutletWorkspaceSettings {
	const tierRates = {} as Record<OutletPrTier, OutletTierRateSettings>;
	for (const tier of OUTLET_PR_TIERS) {
		tierRates[tier] = { ...DEFAULT_OUTLET_WORKSPACE.tierRates[tier] };
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
		: { ...DEFAULT_OUTLET_WORKSPACE.commissionOnlyRates };

	const drinkMenu =
		record.drinkMenu.length > 0
			? [...record.drinkMenu]
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((d) => ({
						id: d.slug,
						name: d.name,
						priceRm: num(d.priceRm),
						category:
							d.category === "drink"
								? ("drink" as const)
								: ("service" as const),
					}))
			: DEFAULT_OUTLET_WORKSPACE.drinkMenu.map((d) => ({ ...d }));

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
			category:
				d.category === "drink" ? ("drink" as const) : ("service" as const),
			sortOrder: i,
		})),
	};
}
