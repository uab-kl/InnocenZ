/** Agency portal demo data — roster, commission rules, history, PR roster */

import { SEED_COMCARD_AGENCY_PRS } from "@agency-portal/lib/agency-pr-comcards";
import {
	addDaysToIso,
	isoOnWeekday,
	migrateDemoDateIso,
} from "@agency-portal/lib/demo-clock";
import { buildDemoESignatureDataUrl } from "@agency-portal/lib/finance-head-stamp";
import type { PostJobPayTierId } from "@agency-portal/lib/post-job-pay-tiers";
import {
	buildSeedPrPortfolio,
	DEFAULT_PR_AGENCY_NAME,
	fmtDateLabelFromIso,
	type PrComcard,
	SEED_PR_AVATAR_IMAGE,
	SEED_PR_COMCARD_IMAGE,
	TIED_DEMO_ROSTER_PR_ID,
} from "@agency-portal/lib/pr-demo";
import type {
	PrPayClass,
	PrPayClassChange,
} from "@agency-portal/lib/pr-penalties";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import type { PendingPR } from "@agency-portal/lib/store";

export interface OutletCommissionRule {
	outlet: string;
	wagePerHour: number;
	drinkPct: number;
	tipPct: number;
	tablePct: number;
	otAfterHours: number;
	platformPct: number;
	/** Per PR training tier — outlet workspace edits sync here */
	tierRates?: Partial<Record<OutletPrTier, OutletTierRateSettings>>;
	/** Payout multipliers by PR training tier (per outlet) */
	tierMultipliers?: Record<OutletPrTier, number>;
}

export const OUTLET_PR_TIERS = [
	"Tier I",
	"Tier II",
	"Tier III",
	"Tier IV",
	"Tier V",
	"Servant",
] as const;
export type OutletPrTier = (typeof OUTLET_PR_TIERS)[number];
/** Tiers I–V — ascending pay ladder (Servant sits below Tier I). */
export const OUTLET_RANKED_PR_TIERS = [
	"Tier I",
	"Tier II",
	"Tier III",
	"Tier IV",
	"Tier V",
] as const;
export const OUTLET_SERVANT_TIER: OutletPrTier = "Servant";
/** Canonical base tier — flat commission fields and 1× multiplier */
export const OUTLET_BASE_TIER: OutletPrTier = "Tier I";

export interface OutletTierRateSettings {
	/** Flat pay per completed shift (legacy field name: wagePerHour). */
	wagePerHour: number;
	drinkPct: number;
	/** Happy-hour drink commission % — defaults to `drinkPct` when unset. */
	happyHourDrinkPct?: number;
	tipPct: number;
	tablePct: number;
	otAfterHours: number;
	/** Optional per-shift sales target (RM) — set on Post Job only */
	targetSalesRm?: number;
}

const TIER_WAGE_MULTIPLIERS: Record<OutletPrTier, number> = {
	"Tier I": 1,
	"Tier II": 1.2,
	"Tier III": 1.4,
	"Tier IV": 1.65,
	"Tier V": 2,
	Servant: 0.4,
};

const SERVANT_DRINK_PCT_OFFSET = -2;
const SERVANT_TIP_PCT_OFFSET = -3;

/** Higher tiers earn stepped drinks & tips commission above the Tier I base. */
const TIER_DRINK_PCT_STEP = 1;
const TIER_TIP_PCT_STEP = 1;
/** Happy-hour drink commission sits below normal hours (cheaper drink prices). */
export const HAPPY_HOUR_DRINK_PCT_OFFSET = -5;

export function defaultHappyHourDrinkPct(normalDrinkPct: number): number {
	return Math.max(0, normalDrinkPct + HAPPY_HOUR_DRINK_PCT_OFFSET);
}

function defaultCommissionForTier(
	base: OutletTierRateSettings,
	tier: OutletPrTier,
): Pick<OutletTierRateSettings, "drinkPct" | "happyHourDrinkPct" | "tipPct"> {
	if (tier === OUTLET_SERVANT_TIER) {
		const drinkPct = Math.max(0, base.drinkPct + SERVANT_DRINK_PCT_OFFSET);
		return {
			drinkPct,
			happyHourDrinkPct: defaultHappyHourDrinkPct(drinkPct),
			tipPct: Math.max(0, base.tipPct + SERVANT_TIP_PCT_OFFSET),
		};
	}
	const tierIndex = OUTLET_RANKED_PR_TIERS.indexOf(
		tier as (typeof OUTLET_RANKED_PR_TIERS)[number],
	);
	const step = Math.max(0, tierIndex);
	const drinkPct = Math.min(100, base.drinkPct + step * TIER_DRINK_PCT_STEP);
	return {
		drinkPct,
		happyHourDrinkPct: defaultHappyHourDrinkPct(drinkPct),
		tipPct: Math.min(100, base.tipPct + step * TIER_TIP_PCT_STEP),
	};
}

export function tierHappyHourDrinkPct(
	rates: Pick<OutletTierRateSettings, "drinkPct" | "happyHourDrinkPct">,
): number {
	return rates.happyHourDrinkPct ?? defaultHappyHourDrinkPct(rates.drinkPct);
}

/** Backfill when legacy data copied normal drink % to happy hour. */
export function migrateTierRatesHappyHourDrinks(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const out = cloneTierRates(tierRates);
	for (const tier of OUTLET_PR_TIERS) {
		const rates = out[tier];
		if (
			rates.happyHourDrinkPct == null ||
			rates.happyHourDrinkPct === rates.drinkPct
		) {
			out[tier] = {
				...rates,
				happyHourDrinkPct: defaultHappyHourDrinkPct(rates.drinkPct),
			};
		}
	}
	return out;
}

const OT_HOURLY_PREMIUM = 1.5;

/**
 * Standard shift length (hours) used for RM/HR = daily wage ÷ hours.
 * Default 6; outlets can change this per shift when they set shift times.
 */
export const DEFAULT_STANDARD_SHIFT_HOURS = 6;

/** Default sales targets (RM) on the outlet workspace rate card. */
export const DEFAULT_WORKSPACE_TIER_TARGET_SALES: Record<OutletPrTier, number> =
	{
		"Tier I": 1000,
		"Tier II": 1200,
		"Tier III": 1500,
		"Tier IV": 1800,
		"Tier V": 2000,
		Servant: 800,
	};

/** Coerce stored OT/standard hours into a usable shift length (1–24h, default 6). */
export function resolveStandardShiftHours(
	otAfterHours?: number | null,
): number {
	if (
		otAfterHours == null ||
		!Number.isFinite(otAfterHours) ||
		otAfterHours <= 0
	) {
		return DEFAULT_STANDARD_SHIFT_HOURS;
	}
	// Absurd values (e.g. minutes saved as hours) fall back to the default.
	if (otAfterHours > 24) return DEFAULT_STANDARD_SHIFT_HOURS;
	return otAfterHours;
}

/** Regular hourly equivalent from flat daily/shift pay ÷ standard hours. */
export function tierBaseRmPerHour(
	rule: Pick<OutletTierRateSettings, "wagePerHour" | "otAfterHours">,
): number {
	if (rule.wagePerHour <= 0) return 0;
	const hours = resolveStandardShiftHours(rule.otAfterHours);
	return rule.wagePerHour / hours;
}

/** OT hourly pay rate (1.5× base hourly — matches `calcShiftWagesFromRule`). */
export function tierOtRmPerHour(
	rule: Pick<OutletTierRateSettings, "wagePerHour" | "otAfterHours">,
): number {
	const base = tierBaseRmPerHour(rule);
	return base > 0 ? base * OT_HOURLY_PREMIUM : 0;
}

export const TIER_WAGE_STEP = 5;
export const TIER_WAGE_MIN = 40;
export const TIER_WAGE_MAX = 1000;

export function snapTierWage(value: number): number {
	const snapped = Math.round(value / TIER_WAGE_STEP) * TIER_WAGE_STEP;
	return Math.min(TIER_WAGE_MAX, Math.max(TIER_WAGE_MIN, snapped));
}

export function tierWageFromMultiplier(
	baseWage: number,
	multiplier: number,
): number {
	return snapTierWage(snapTierWage(baseWage) * multiplier);
}

/** Derive tier multipliers from actual per-tier wages (outlet workspace → agency rules). */
export function deriveTierMultipliersFromRates(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, number> {
	const baseWage = tierRates[OUTLET_BASE_TIER]?.wagePerHour ?? 0;
	if (baseWage <= 0) return normalizeOutletTierMultipliers();
	const partial = {} as Partial<Record<OutletPrTier, number>>;
	for (const tier of OUTLET_PR_TIERS) {
		partial[tier] =
			tier === OUTLET_BASE_TIER
				? 1
				: Math.round((tierRates[tier].wagePerHour / baseWage) * 100) / 100;
	}
	return normalizeOutletTierMultipliers(partial);
}

function snapTierRatesWages(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const out = { ...tierRates };
	for (const tier of OUTLET_PR_TIERS) {
		out[tier] = {
			...out[tier],
			wagePerHour: snapTierWage(out[tier].wagePerHour),
		};
	}
	return out;
}

export function buildDefaultTierRates(
	base: OutletTierRateSettings,
): Record<OutletPrTier, OutletTierRateSettings> {
	const baseWage = snapTierWage(base.wagePerHour);
	const otAfterHours = resolveStandardShiftHours(base.otAfterHours);
	const out = {} as Record<OutletPrTier, OutletTierRateSettings>;
	for (const tier of OUTLET_PR_TIERS) {
		const commission = defaultCommissionForTier(base, tier);
		out[tier] = {
			wagePerHour: tierWageFromMultiplier(
				baseWage,
				TIER_WAGE_MULTIPLIERS[tier],
			),
			drinkPct: commission.drinkPct,
			happyHourDrinkPct: commission.happyHourDrinkPct,
			tipPct: commission.tipPct,
			tablePct: base.tablePct,
			otAfterHours,
			targetSalesRm:
				base.targetSalesRm ?? DEFAULT_WORKSPACE_TIER_TARGET_SALES[tier],
		};
	}
	// Keep explicit per-tier targets from defaults (base.targetSalesRm would copy one value).
	if (base.targetSalesRm == null) {
		for (const tier of OUTLET_PR_TIERS) {
			out[tier] = {
				...out[tier],
				targetSalesRm: DEFAULT_WORKSPACE_TIER_TARGET_SALES[tier],
			};
		}
	}
	return out;
}

/**
 * Fix rate cards where daily wages were stored as hourly equivalents
 * (e.g. Tier I = 83.33 instead of 500) and/or `otAfterHours` was nonsensical.
 * RM/HR = daily wage ÷ standard hours (default 6).
 */
export function repairTierRatesDailyWageSemantics(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const base = tierRates[OUTLET_BASE_TIER];
	if (!base) return tierRates;

	const expectedHourly =
		OUTLET_STANDARD_SHIFT_PAY / DEFAULT_STANDARD_SHIFT_HOURS;
	// e.g. 83.33 left over from daily÷6 being written back into daily wages
	const looksLikeHourlyAsDaily =
		Math.abs(base.wagePerHour - expectedHourly) < 2;

	const needsOtFix = OUTLET_PR_TIERS.some((tier) => {
		const h = tierRates[tier]?.otAfterHours ?? 0;
		return h <= 0 || h > 24;
	});

	if (!looksLikeHourlyAsDaily && !needsOtFix) {
		// Still backfill missing sales targets so the rate card shows sensible defaults.
		let touched = false;
		const out = cloneTierRates(tierRates);
		for (const tier of OUTLET_PR_TIERS) {
			if (out[tier].targetSalesRm == null) {
				out[tier] = {
					...out[tier],
					targetSalesRm: DEFAULT_WORKSPACE_TIER_TARGET_SALES[tier],
				};
				touched = true;
			}
		}
		return touched ? out : tierRates;
	}

	const out = cloneTierRates(tierRates);
	for (const tier of OUTLET_PR_TIERS) {
		const prev = out[tier];
		const wage = looksLikeHourlyAsDaily
			? snapTierWage(prev.wagePerHour * DEFAULT_STANDARD_SHIFT_HOURS)
			: snapTierWage(prev.wagePerHour);
		out[tier] = {
			...prev,
			wagePerHour: wage,
			otAfterHours: DEFAULT_STANDARD_SHIFT_HOURS,
			targetSalesRm:
				prev.targetSalesRm ?? DEFAULT_WORKSPACE_TIER_TARGET_SALES[tier],
		};
	}
	return out;
}

/** Spread flat legacy commission rows into per-tier defaults when every tier still matches Tier I. */
export function ensureDistinctTierCommissions(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const base = tierRates[OUTLET_BASE_TIER];
	const allSameDrink = OUTLET_RANKED_PR_TIERS.every(
		(tier) => tierRates[tier].drinkPct === base.drinkPct,
	);
	const allSameHappyHour = OUTLET_RANKED_PR_TIERS.every(
		(tier) =>
			tierHappyHourDrinkPct(tierRates[tier]) === tierHappyHourDrinkPct(base),
	);
	const allSameTip = OUTLET_RANKED_PR_TIERS.every(
		(tier) => tierRates[tier].tipPct === base.tipPct,
	);
	if (!allSameDrink && !allSameHappyHour && !allSameTip) return tierRates;

	const rebuilt = buildDefaultTierRates(base);
	const out = cloneTierRates(tierRates);
	for (const tier of OUTLET_PR_TIERS) {
		out[tier] = { ...out[tier] };
		if (allSameDrink) out[tier].drinkPct = rebuilt[tier].drinkPct;
		if (allSameHappyHour)
			out[tier].happyHourDrinkPct = rebuilt[tier].happyHourDrinkPct;
		if (allSameTip) out[tier].tipPct = rebuilt[tier].tipPct;
	}
	return out;
}

export function tierWagesAreDistinct(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): boolean {
	const wages = OUTLET_RANKED_PR_TIERS.map((t) => tierRates[t].wagePerHour);
	if (new Set(wages).size <= 1) return false;
	for (let i = 1; i < OUTLET_RANKED_PR_TIERS.length; i++) {
		if (wages[i]! <= wages[i - 1]!) return false;
	}
	const servantWage = tierRates[OUTLET_SERVANT_TIER]?.wagePerHour ?? 0;
	if (servantWage > 0 && servantWage >= wages[0]!) return false;
	return true;
}

/** Rebuild wages from Tier I base when tiers share the same pay (legacy flat data). */
export function ensureAscendingTierWages(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	if (tierWagesAreDistinct(tierRates)) return tierRates;
	const base = tierRates[OUTLET_BASE_TIER];
	const rebuilt = buildDefaultTierRates(base);
	const out = { ...tierRates };
	for (const tier of OUTLET_PR_TIERS) {
		out[tier] = { ...out[tier], wagePerHour: rebuilt[tier].wagePerHour };
	}
	return out;
}

export function cloneTierRates(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	return OUTLET_PR_TIERS.reduce(
		(acc, tier) => {
			acc[tier] = { ...tierRates[tier] };
			return acc;
		},
		{} as Record<OutletPrTier, OutletTierRateSettings>,
	);
}

export function getTierWageFromRates(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	tier: OutletPrTier,
): number {
	const wage =
		tierRates[tier]?.wagePerHour ?? tierRates[OUTLET_BASE_TIER].wagePerHour;
	return snapTierWage(wage);
}

export function formatTierShiftPay(amount: number): string {
	return `RM ${amount.toLocaleString("en-MY")}/shift`;
}

/** Flat shift pay on completion, plus OT premium beyond standard shift hours. */
export function calcShiftWagesFromRule(
	rule: Pick<OutletTierRateSettings, "wagePerHour" | "otAfterHours">,
	hoursWorked: number,
	shiftCompleted = true,
): { shiftPay: number; otSupplement: number; wages: number } {
	if (!shiftCompleted) {
		return { shiftPay: 0, otSupplement: 0, wages: 0 };
	}
	const shiftPay = rule.wagePerHour;
	const standardHours = resolveStandardShiftHours(rule.otAfterHours);
	const otHours = Math.max(0, hoursWorked - standardHours);
	const otHourly = standardHours > 0 ? shiftPay / standardHours : 0;
	const otSupplement = Math.round(otHours * otHourly * 1.5 * 100) / 100;
	const wages = Math.round((shiftPay + otSupplement) * 100) / 100;
	return { shiftPay, otSupplement, wages };
}

export function formatShiftWagesDetail(
	rule: Pick<OutletTierRateSettings, "wagePerHour" | "otAfterHours">,
	hoursWorked: number,
	overtimeMinutes = 0,
): string {
	const { shiftPay, otSupplement } = calcShiftWagesFromRule(
		rule,
		hoursWorked,
		true,
	);
	if (overtimeMinutes > 0 && otSupplement > 0) {
		return `${formatTierShiftPay(shiftPay)} + OT ${overtimeMinutes}m`;
	}
	return `${formatTierShiftPay(shiftPay)} · paid on shift completion`;
}

export function averageTierWage(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): number {
	const wages = OUTLET_PR_TIERS.map((t) => tierRates[t].wagePerHour);
	return Math.round(wages.reduce((a, b) => a + b, 0) / wages.length);
}

export function estimateShiftLaborCost(opts: {
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	/** @deprecated Per-shift pay — hours are ignored. */
	hours?: number;
	quantity: number;
	prIds?: string[];
	prTierById?: Record<string, string | undefined>;
}): number {
	const { tierRates, quantity, prIds, prTierById } = opts;
	if (prIds?.length) {
		return Math.round(
			prIds.reduce((sum, id) => {
				const tier = (prTierById?.[id] ?? OUTLET_BASE_TIER) as OutletPrTier;
				return sum + getTierWageFromRates(tierRates, tier);
			}, 0),
		);
	}
	return Math.round(averageTierWage(tierRates) * quantity);
}

export function formatTierWageRange(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): string {
	const wages = OUTLET_PR_TIERS.map((t) => tierRates[t].wagePerHour);
	const min = Math.min(...wages);
	const max = Math.max(...wages);
	if (min === max) return formatTierShiftPay(min);
	return `RM ${min.toLocaleString("en-MY")}–${max.toLocaleString("en-MY")}/shift`;
}

export function formatTierSalesTargets(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): string | null {
	const targets = OUTLET_PR_TIERS.map((t) => tierRates[t].targetSalesRm).filter(
		(v): v is number => v != null && v > 0,
	);
	if (targets.length === 0) return null;
	const min = Math.min(...targets);
	const max = Math.max(...targets);
	if (min === max) return `RM ${min.toLocaleString("en-MY")} sales target`;
	return `RM ${min.toLocaleString("en-MY")}–${max.toLocaleString("en-MY")} sales targets`;
}

export function normalizeTierRates(
	base: OutletTierRateSettings,
	partial?: Partial<Record<OutletPrTier, OutletTierRateSettings>>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const snappedBase = { ...base, wagePerHour: snapTierWage(base.wagePerHour) };
	const defaults = buildDefaultTierRates(snappedBase);
	if (!partial) return defaults;
	const out = { ...defaults };
	for (const tier of OUTLET_PR_TIERS) {
		if (partial[tier]) {
			out[tier] = {
				...defaults[tier],
				...partial[tier],
				wagePerHour: snapTierWage(
					partial[tier].wagePerHour ?? defaults[tier].wagePerHour,
				),
				otAfterHours: resolveStandardShiftHours(
					partial[tier].otAfterHours ??
						defaults[tier].otAfterHours ??
						snappedBase.otAfterHours,
				),
			};
		}
	}
	return ensureDistinctTierCommissions(
		ensureAscendingTierWages(snapTierRatesWages(out)),
	);
}

/** Workspace save — keep explicit per-tier edits; only snap wages and fill missing tiers. */
export function normalizeWorkspaceTierRates(
	base: OutletTierRateSettings,
	partial?: Partial<Record<OutletPrTier, OutletTierRateSettings>>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const snappedBase = { ...base, wagePerHour: snapTierWage(base.wagePerHour) };
	const defaults = buildDefaultTierRates(snappedBase);
	if (!partial) return defaults;
	const out = { ...defaults };
	for (const tier of OUTLET_PR_TIERS) {
		if (partial[tier]) {
			out[tier] = {
				...defaults[tier],
				...partial[tier],
				wagePerHour: snapTierWage(
					partial[tier].wagePerHour ?? defaults[tier].wagePerHour,
				),
				otAfterHours: resolveStandardShiftHours(
					partial[tier].otAfterHours ??
						defaults[tier].otAfterHours ??
						snappedBase.otAfterHours,
				),
			};
		}
	}
	return snapTierRatesWages(out);
}

const DEFAULT_TIER_MULTIPLIERS: Record<OutletPrTier, number> = {
	"Tier I": 1,
	"Tier II": 1.2,
	"Tier III": 1.4,
	"Tier IV": 1.65,
	"Tier V": 2,
	Servant: 0.4,
};

export function usesLegacyTierIIIBaseMultipliers(
	multipliers: Partial<Record<OutletPrTier, number>> | undefined,
): boolean {
	const m = { ...DEFAULT_TIER_MULTIPLIERS, ...multipliers };
	return m["Tier III"] === 1 && m["Tier I"] < 1;
}

export function migrateTierMultipliersToTierIBase(
	multipliers: Partial<Record<OutletPrTier, number>> | undefined,
): Record<OutletPrTier, number> {
	const m = normalizeOutletTierMultipliers(multipliers);
	if (!usesLegacyTierIIIBaseMultipliers(m)) return m;
	const scale = 1 / m["Tier I"];
	const scaled = {} as Record<OutletPrTier, number>;
	for (const tier of OUTLET_PR_TIERS) {
		scaled[tier] = Math.round(m[tier] * scale * 100) / 100;
	}
	return normalizeOutletTierMultipliers(scaled);
}

export function migrateCommissionRuleToTierIBase(
	rule: OutletCommissionRule,
): OutletCommissionRule {
	const tierMultipliers = migrateTierMultipliersToTierIBase(
		rule.tierMultipliers,
	);
	if (!usesLegacyTierIIIBaseMultipliers(rule.tierMultipliers)) {
		return { ...rule, tierMultipliers };
	}
	const legacyMult = normalizeOutletTierMultipliers(rule.tierMultipliers);
	const tierIBase = rule.tierRates?.[OUTLET_BASE_TIER] ?? {
		wagePerHour: Math.round(rule.wagePerHour * legacyMult["Tier I"]),
		drinkPct: rule.drinkPct,
		tipPct: rule.tipPct,
		tablePct: rule.tablePct,
		otAfterHours: rule.otAfterHours,
	};
	return {
		...rule,
		wagePerHour: tierIBase.wagePerHour,
		drinkPct: tierIBase.drinkPct,
		tipPct: tierIBase.tipPct,
		tablePct: tierIBase.tablePct,
		otAfterHours: tierIBase.otAfterHours,
		tierMultipliers,
		tierRates: rule.tierRates ?? buildDefaultTierRates(tierIBase),
	};
}

export function normalizeOutletTierMultipliers(
	partial?: Partial<Record<OutletPrTier, number>>,
): Record<OutletPrTier, number> {
	return { ...DEFAULT_TIER_MULTIPLIERS, ...partial };
}

export function getEffectiveOutletRule(
	outlet: string,
	prTier: string | undefined,
	rules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
	shiftTierRates?: Record<OutletPrTier, OutletTierRateSettings>,
): OutletCommissionRule {
	const base = getOutletRule(outlet, rules);
	const tier = prTier as OutletPrTier;
	const shiftRate = tier && shiftTierRates?.[tier];
	if (shiftRate) {
		return {
			...base,
			wagePerHour: snapTierWage(shiftRate.wagePerHour),
			drinkPct: shiftRate.drinkPct,
			tipPct: shiftRate.tipPct,
			tablePct: shiftRate.tablePct,
			otAfterHours: shiftRate.otAfterHours,
		};
	}
	const tierRate = tier && base.tierRates?.[tier];
	const mult = tier ? (base.tierMultipliers?.[tier] ?? 1) : 1;
	if (tierRate) {
		return {
			...base,
			wagePerHour: snapTierWage(tierRate.wagePerHour),
			drinkPct: tierRate.drinkPct,
			tipPct: tierRate.tipPct,
			tablePct: tierRate.tablePct,
			otAfterHours: tierRate.otAfterHours,
		};
	}
	if (tier && mult !== 1) {
		return {
			...base,
			wagePerHour: tierWageFromMultiplier(base.wagePerHour, mult),
		};
	}
	return { ...base, wagePerHour: snapTierWage(base.wagePerHour) };
}

export const SCALING_TIER_MULTIPLIERS: Record<string, number> = {
	...DEFAULT_TIER_MULTIPLIERS,
};

function commissionRuleSeed(
	rule: Omit<OutletCommissionRule, "tierRates" | "tierMultipliers"> & {
		tierRates?: Partial<Record<OutletPrTier, OutletTierRateSettings>>;
		tierMultipliers?: Partial<Record<OutletPrTier, number>>;
	},
): OutletCommissionRule {
	const tierBase = {
		wagePerHour: snapTierWage(rule.wagePerHour),
		drinkPct: rule.drinkPct,
		tipPct: rule.tipPct,
		tablePct: rule.tablePct,
		otAfterHours: rule.otAfterHours,
	};
	return {
		...rule,
		wagePerHour: tierBase.wagePerHour,
		tierMultipliers: normalizeOutletTierMultipliers(rule.tierMultipliers),
		tierRates: rule.tierRates
			? snapTierRatesWages(normalizeTierRates(tierBase, rule.tierRates))
			: buildDefaultTierRates(tierBase),
	};
}

export const OUTLET_STANDARD_SHIFT_PAY = 500;

export const OUTLET_COMMISSION_RULES: OutletCommissionRule[] = [
	commissionRuleSeed({
		outlet: "Velvet 23",
		wagePerHour: OUTLET_STANDARD_SHIFT_PAY,
		drinkPct: 10,
		tipPct: 15,
		tablePct: 10,
		otAfterHours: 6,
		platformPct: 5,
	}),
	commissionRuleSeed({
		outlet: "Mermate",
		wagePerHour: OUTLET_STANDARD_SHIFT_PAY,
		drinkPct: 10,
		tipPct: 12,
		tablePct: 8,
		otAfterHours: 6,
		platformPct: 5,
	}),
	commissionRuleSeed({
		outlet: "Bear Lounge",
		wagePerHour: OUTLET_STANDARD_SHIFT_PAY,
		drinkPct: 9,
		tipPct: 14,
		tablePct: 10,
		otAfterHours: 5,
		platformPct: 5,
	}),
	commissionRuleSeed({
		outlet: "Onyx KL",
		wagePerHour: OUTLET_STANDARD_SHIFT_PAY,
		drinkPct: 7,
		tipPct: 16,
		tablePct: 12,
		otAfterHours: 6,
		platformPct: 5,
	}),
	commissionRuleSeed({
		outlet: "Urban Soul",
		wagePerHour: OUTLET_STANDARD_SHIFT_PAY,
		drinkPct: 11,
		tipPct: 10,
		tablePct: 8,
		otAfterHours: 6,
		platformPct: 5,
	}),
];

/** Bump legacy per-shift pay (≤80) to the current standard and rebuild tier rates. */
export function migrateLegacyOutletCommissionRules(
	rules: OutletCommissionRule[],
): OutletCommissionRule[] {
	return rules.map((rule) => {
		if (rule.wagePerHour >= OUTLET_STANDARD_SHIFT_PAY) return rule;
		return commissionRuleSeed({
			outlet: rule.outlet,
			wagePerHour: OUTLET_STANDARD_SHIFT_PAY,
			drinkPct: rule.drinkPct,
			tipPct: rule.tipPct,
			tablePct: rule.tablePct,
			otAfterHours: rule.otAfterHours,
			platformPct: rule.platformPct,
		});
	});
}

export function getOutletRule(
	outlet: string,
	rules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
): OutletCommissionRule {
	return (
		rules.find((r) => r.outlet === outlet) ??
		rules[0] ??
		OUTLET_COMMISSION_RULES[0]
	);
}

/** Per-item payout from sealed shift log */
export function calcShiftPayout(
	input: {
		outlet: string;
		hoursWorked: number;
		drinks: number;
		drinkSales: number;
		tips: number;
		checkOutAfterOt?: boolean;
		/** PR training tier — uses tier-specific wage & commission when set */
		prTier?: string;
		/** Per-shift tier rate snapshot — overrides outlet commission rules */
		shiftTierRates?: Record<OutletPrTier, OutletTierRateSettings>;
	},
	rules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
) {
	const rule = getEffectiveOutletRule(
		input.outlet,
		input.prTier,
		rules,
		input.shiftTierRates,
	);
	const { shiftPay, otSupplement, wages } = calcShiftWagesFromRule(
		rule,
		input.hoursWorked,
		true,
	);
	const drinkCommission = (input.drinkSales * rule.drinkPct) / 100;
	const tipCommission = (input.tips * rule.tipPct) / 100;
	return {
		shiftPay,
		otSupplement,
		wages,
		drinkCommission: Math.round(drinkCommission * 100) / 100,
		tipCommission: Math.round(tipCommission * 100) / 100,
		total: Math.round((wages + drinkCommission + tipCommission) * 100) / 100,
		rule,
	};
}

export type RosterSlotStatus =
	| "scheduled"
	| "on-duty"
	| "en-route"
	| "unavailable"
	| "swap-pending"
	| "assignment-pending"
	| "outlet-pending"
	| "outlet-request-pending";

/** Agency roster UI — en-route is shown as scheduled (only Scheduled / On duty labels). */
export function rosterPageDisplayStatus(
	status: RosterSlotStatus,
): RosterSlotStatus {
	return status === "en-route" ? "scheduled" : status;
}

export interface AgencyAssignmentMeta {
	agencyName?: string;
	agencyNote?: string;
	/** Posted / tied outlet shift id from Manage Outlet (e.g. posted-s4) */
	outletShiftId?: string;
	assignedAt: string;
	/** Epoch ms — used for "12 min ago" on PR Shifts */
	assignedAtMs?: number;
	respondedAt?: string;
	/** Event-wide headcount for Manage Outlet demand/supplied (defaults to 1). */
	eventDemand?: number;
	/** PRs already assigned to this event. */
	eventSupplied?: number;
	/** Linked outlet shift applicant row when outlet requested this PR */
	shiftApplicantId?: string;
	requestedByOutlet?: boolean;
}

export interface AgencyRosterSlot {
	id: string;
	prId: string;
	prName: string;
	outlet: string;
	date: string;
	dateIso: string;
	shift: string;
	shiftStart: string;
	shiftEnd: string;
	status: RosterSlotStatus;
	checkedInAt?: string;
	checkedOutAt?: string;
	lateFlag?: boolean;
	noShowFlag?: boolean;
	/** PR cancelled shift — wage deduction logged for next PV */
	payDeductionRm?: number;
	cancelledAt?: string;
	prUnavailableNote?: string;
	/** Live floor metrics — synced with outlet log sales & agency live view */
	floorDrinks?: number;
	floorTips?: number;
	estPayout?: number;
	/** Agency assigned PR to this outlet — PR must approve before shift locks */
	agencyAssignment?: AgencyAssignmentMeta;
	/** Agency requests moving PR to another outlet — PR approves or declines */
	outletSwap?: OutletSwapRequest;
	/** Operating agency that owns this roster slot (defaults to "atlas" when unset). */
	agencyId?: string;
	/**
	 * That agency's NAME, when the builder was given a way to resolve it.
	 *
	 * Backend slots carry only `agencyId` — a uuid — and the demo lookup table
	 * that used to translate ids to names knows nothing about real orgs. So on a
	 * real session there was no honest name to show, and the label chain ran all
	 * the way to the demo literal "Atlas Agency", crediting every PR to a real
	 * company that had nothing to do with them.
	 *
	 * Populating this is what lets `rosterSlotAgencyName` return the TRUTH rather
	 * than choosing between a lie and a blank. Optional because demo slots resolve
	 * through their own table and never need it.
	 */
	agencyName?: string;
	/** Pay-tier column this assignment fills — gates commission-only vs basic eligibility. */
	payTierId?: PostJobPayTierId;
	/**
	 * Where the PR's phone actually was when it stamped in, as verified and
	 * stored by the backend. Undefined on demo slots and on stamps taken before
	 * geofencing shipped — the GPS panel marks those rows estimated rather than
	 * passing an invented dot off as evidence. `checkInDistanceM` is the server's
	 * own measurement against the outlet pin, not anything the phone reported.
	 */
	checkInLat?: number;
	checkInLng?: number;
	checkInDistanceM?: number;
	checkInAccuracyM?: number;
	/**
	 * The outlet's own saved pin and fence, FK-joined from the outlet row at read
	 * time — never copied onto the assignment. Undefined until the outlet drops
	 * its pin, which is also when the backend starts enforcing the fence.
	 */
	outletLat?: number;
	outletLng?: number;
	outletGeoFenceRadiusM?: number;
}

export type OutletSwapStatus = "pending_pr" | "approved" | "declined";

export interface OutletSwapRequest {
	targetOutlet: string;
	status: OutletSwapStatus;
	agencyName?: string;
	agencyNote?: string;
	requestedAt: string;
	requestedAtMs?: number;
	respondedAt?: string;
}

/**
 * Agency tied to this roster shift — assignment, swap request, or default tied agency.
 * On agency portals, prefer {@link agencyPortalLabel} for the viewing agency so dual-tied
 * PRs show that portal's name.
 */
/**
 * Is this a REAL agency id (a backend uuid) rather than a demo key?
 *
 * Demo data uses short readable keys — `"atlas"`, `"delta"` — while a slot built
 * by `rosterSlotsFromBackend` carries `shift_assignment.agency_id`, a uuid. That
 * shape difference is a local, dependency-free way to tell a real row from a
 * demo one, which is what the label rules below need: it takes no session
 * plumbing and cannot go stale the way a "demo mode" flag does.
 *
 * Deliberately shape-based rather than a lookup miss: an id that is simply
 * absent from `AGENCY_OWNERS_BY_ID` could be either, and guessing wrong is how
 * a demo name reaches a real screen.
 */
const REAL_AGENCY_ID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRealAgencyId(agencyId: string | null | undefined): boolean {
	return Boolean(agencyId && REAL_AGENCY_ID_RE.test(agencyId));
}

export function rosterSlotAgencyName(
	slot: AgencyRosterSlot,
	fallback = DEFAULT_PR_AGENCY_NAME,
): string {
	// `agencyName` FIRST: it is the only arm that can speak for a real agency.
	// The two below it are demo-authored and the id lookup after them reads a
	// demo table, so before this existed a backend slot had no truthful path at
	// all — every route led either to a demo company's name or to nothing.
	const named =
		slot.agencyName ??
		slot.agencyAssignment?.agencyName ??
		slot.outletSwap?.agencyName;
	if (named) return named;
	if (slot.agencyId) {
		const demoName = AGENCY_OWNERS_BY_ID[slot.agencyId]?.orgName;
		if (demoName) return demoName;
		// ⚠️ A REAL agency id we cannot name resolves to NOTHING, never to the demo
		// literal. `DEFAULT_PR_AGENCY_NAME` is "Atlas Agency" — an actual company
		// on this platform — so reaching it here printed a specific, wrong supplier
		// with complete confidence on every real session. Note that `fallback`
		// itself defaults to that literal, so merely passing `undefined` reaches it.
		if (isRealAgencyId(slot.agencyId)) return "";
	}
	return fallback;
}

/** Agency label for a managed PR row — roster assignment, payroll link, or default tied agency. */
export function managedPrAgencyLabel(
	prId: string,
	roster: AgencyRosterSlot[],
	options: {
		agencyName?: string;
	} = {},
): string {
	const slotAgency = roster.find(
		(s) =>
			s.prId === prId &&
			(s.agencyAssignment?.agencyName ||
				s.outletSwap?.agencyName ||
				s.agencyId),
	);
	if (slotAgency) return rosterSlotAgencyName(slotAgency, options.agencyName);

	return options.agencyName ?? DEFAULT_PR_AGENCY_NAME;
}

function rosterDate(iso: string) {
	return fmtDateLabelFromIso(iso);
}

function withRosterDate<T extends Pick<AgencyRosterSlot, "dateIso">>(
	slot: T,
): T & { date: string } {
	return { ...slot, date: rosterDate(slot.dateIso) };
}

export const SEED_AGENCY_ROSTER: AgencyRosterSlot[] = [
	withRosterDate({
		id: "rs1",
		prId: "p1",
		prName: "Vicky",
		outlet: "Velvet 23",
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		shift: "22:00 — 04:00",
		shiftStart: "22:00",
		shiftEnd: "04:00",
		status: "scheduled",
		floorDrinks: 0,
		floorTips: 0,
		estPayout: 480,
	}),
	withRosterDate({
		id: "rs2",
		prId: "pr-comcard-alice",
		prName: "Alice",
		outlet: "Velvet 23",
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		shift: "22:00 — 04:00",
		shiftStart: "22:00",
		shiftEnd: "04:00",
		status: "scheduled",
		floorDrinks: 0,
		floorTips: 0,
		estPayout: 390,
	}),
	withRosterDate({
		id: "rs3",
		prId: "pr-comcard-moon",
		prName: "Moon",
		outlet: "Onyx KL",
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		shift: "21:00 — 03:00",
		shiftStart: "21:00",
		shiftEnd: "03:00",
		status: "swap-pending",
	}),
	withRosterDate({
		id: "rs4",
		prId: "pr-comcard-victoria",
		prName: "Victoria",
		outlet: "Mermate",
		dateIso: addDaysToIso(DEFAULT_ROSTER_DATE_ISO, 1),
		shift: "20:00 — 02:00",
		shiftStart: "20:00",
		shiftEnd: "02:00",
		status: "unavailable",
	}),
	withRosterDate({
		id: "rs6",
		prId: "p1",
		prName: "Vicky",
		outlet: "Mermate",
		dateIso: isoOnWeekday(DEFAULT_ROSTER_DATE_ISO, 5),
		shift: "22:00 — 04:00",
		shiftStart: "22:00",
		shiftEnd: "04:00",
		status: "scheduled",
		agencyAssignment: {
			agencyName: "Atlas Agency",
			agencyNote: "You are needed at Mermate — Friday lounge relaunch coverage",
			assignedAt: "18 Jun 2026 · 11:36",
			assignedAtMs: Date.now() - 12 * 60 * 1000,
			eventDemand: 16,
			eventSupplied: 11,
		},
	}),
	withRosterDate({
		id: "rs5",
		prId: "pr-comcard-charlotte",
		prName: "Charlotte",
		outlet: "Bear Lounge",
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		shift: "22:30 — 04:30",
		shiftStart: "22:30",
		shiftEnd: "04:30",
		status: "scheduled",
	}),
	withRosterDate({
		id: "rs7",
		prId: "pr-comcard-angie",
		prName: "Angie",
		outlet: "Bear Lounge",
		dateIso: addDaysToIso(DEFAULT_ROSTER_DATE_ISO, 1),
		shift: "22:30 — 04:30",
		shiftStart: "22:30",
		shiftEnd: "04:30",
		status: "scheduled",
		agencyAssignment: {
			agencyName: "Atlas Agency",
			agencyNote: "Bear Lounge launch — host table coverage needed",
			assignedAt: "18 Jun 2026 · 09:12",
			assignedAtMs: Date.now() - 45 * 60 * 1000,
			eventDemand: 14,
			eventSupplied: 9,
		},
	}),
	withRosterDate({
		id: "rs8",
		prId: "pr-comcard-alice",
		prName: "Alice",
		outlet: "Onyx KL",
		dateIso: addDaysToIso(DEFAULT_ROSTER_DATE_ISO, 2),
		shift: "20:00 — 02:00",
		shiftStart: "20:00",
		shiftEnd: "02:00",
		status: "scheduled",
		agencyAssignment: {
			agencyName: "Atlas Agency",
			agencyNote: "Onyx KL rooftop — VIP host slot",
			assignedAt: "18 Jun 2026 · 14:05",
			assignedAtMs: Date.now() - 90 * 60 * 1000,
			eventDemand: 15,
			eventSupplied: 10,
		},
	}),
	withRosterDate({
		id: "rs9",
		prId: "pr-comcard-sarah",
		prName: "Sarah",
		outlet: "Urban Soul",
		dateIso: isoOnWeekday(DEFAULT_ROSTER_DATE_ISO, 5),
		shift: "20:00 — 01:00",
		shiftStart: "20:00",
		shiftEnd: "01:00",
		status: "scheduled",
		agencyAssignment: {
			agencyName: "Atlas Agency",
			agencyNote: "Urban Soul — Friday party floor PR needed",
			assignedAt: "18 Jun 2026 · 16:22",
			assignedAtMs: Date.now() - 25 * 60 * 1000,
			eventDemand: 18,
			eventSupplied: 13,
		},
	}),
];

export interface AgencyManagedPR {
	id: string;
	name: string;
	/** Legal full name as printed on IC / passport */
	icName: string;
	ic: string;
	mobile: string;
	email: string;
	age: number;
	height: number;
	race: string;
	languages: string[];
	place: string;
	yearsExp: number;
	rating: number;
	trainingLevel: string;
	totalPaid: number;
	/**
	 * Kept shifts ÷ concluded shifts, or `null` when the PR has no concluded
	 * shift yet. Null is NOT 0 — a PR who has never been scheduled has missed
	 * nothing, and every render site must show an em-dash rather than "0%",
	 * which reads as a PR who no-showed everything they were given.
	 */
	attendancePct: number | null;
	checkIns: number;
	checkOuts: number;
	noShows: number;
	kpiScore: number;
	kpiTier?: string;
	suspended?: boolean;
	detached?: boolean;
	tiedSince?: string;
	/** Employment arrangement — "commissionOnly" earns no basic wage. Defaults to basic. */
	payClass?: PrPayClass;
	/**
	 * Audit trail of pay-class changes, each effective from a date (ISO yyyy-mm-dd).
	 * Sorted or unsorted; the class in force on a date is the latest entry with
	 * fromIso <= that date. `payClass` remains the current/live value.
	 */
	payClassHistory?: PrPayClassChange[];
	/** Demo attendance counters for penalty evaluation (Phase 2). */
	shiftsThisWeek?: number;
	lateThisWeek?: number;
	mcThisMonth?: number;
	/** Consecutive shift outlet ratings below 3.0★ (most recent streak) */
	consecutiveLowRatings?: number;
	weight?: number;
	/** Synced from PR portal profile */
	avatarPhoto?: string | null;
	comcardImageUrl?: string | null;
	portfolioPhotos?: (string | null)[];
	/** Operating agency this PR is managed by (defaults to "atlas" when unset). */
	agencyId?: string;
	/** All operating agencies this PR is linked to — membership (a PR can be under many). */
	agencyIds?: string[];
}

export function sortAgencyPrsByName(prs: AgencyManagedPR[]): AgencyManagedPR[] {
	return [...prs].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
}

export const SEED_AGENCY_PRS: AgencyManagedPR[] = sortAgencyPrsByName([
	{
		id: "p1",
		name: "Vicky",
		icName: "Victoria Tan Mei Lin",
		ic: "950312-14-8821",
		mobile: "+60 12-881 2201",
		email: "Vicky@inz.my",
		age: 24,
		height: 153,
		weight: 40,
		race: "Chinese",
		languages: ["English", "Mandarin", "Cantonese"],
		place: "KL",
		yearsExp: 4,
		rating: 4.9,
		trainingLevel: "Tier V",
		totalPaid: 18420,
		attendancePct: 98,
		shiftsThisWeek: 5,
		lateThisWeek: 0,
		mcThisMonth: 0,
		checkIns: 41,
		checkOuts: 41,
		noShows: 0,
		kpiScore: 92,
		kpiTier: "A",
		tiedSince: "2022-03-01",
		agencyIds: ["atlas", "delta"],
		avatarPhoto: SEED_PR_AVATAR_IMAGE,
		comcardImageUrl: SEED_PR_COMCARD_IMAGE,
		portfolioPhotos: buildSeedPrPortfolio(),
	},
	...SEED_COMCARD_AGENCY_PRS,
]);

/** Delta Agency's own managed PRs (peer agency demo — distinct people from Atlas). */
export const SEED_DELTA_AGENCY_PRS: AgencyManagedPR[] = sortAgencyPrsByName([
	{
		id: "delta-p1",
		name: "Sofia",
		icName: "Sofia Binti Adnan",
		ic: "970218-10-5623",
		mobile: "+60 13-552 7781",
		email: "sofia@inz.my",
		age: 22,
		height: 165,
		weight: 50,
		race: "Malay",
		languages: ["English", "Malay"],
		place: "Cheras",
		yearsExp: 2,
		rating: 4.7,
		trainingLevel: "Tier III",
		totalPaid: 8600,
		attendancePct: 95,
		checkIns: 18,
		checkOuts: 18,
		noShows: 0,
		kpiScore: 84,
		kpiTier: "B",
		tiedSince: "2025-01-10",
		agencyId: "delta",
		avatarPhoto: null,
		comcardImageUrl: null,
	},
	{
		id: "delta-p2",
		name: "Rina",
		icName: "Katherine Rina Joseph",
		ic: "960705-08-4412",
		mobile: "+60 17-330 2245",
		email: "rina@inz.my",
		age: 23,
		height: 160,
		weight: 46,
		race: "Indian",
		languages: ["English", "Tamil", "Malay"],
		place: "Ampang",
		yearsExp: 3,
		rating: 4.8,
		trainingLevel: "Tier IV",
		totalPaid: 11200,
		attendancePct: 97,
		checkIns: 24,
		checkOuts: 24,
		noShows: 0,
		kpiScore: 88,
		kpiTier: "A",
		tiedSince: "2024-08-01",
		agencyId: "delta",
		avatarPhoto: null,
		comcardImageUrl: null,
	},
	{
		id: "delta-p3",
		name: "Mei",
		icName: "Chong Mei Yee",
		ic: "980921-14-3390",
		mobile: "+60 11-2887 9902",
		email: "mei@inz.my",
		age: 21,
		height: 158,
		weight: 44,
		race: "Chinese",
		languages: ["English", "Mandarin", "Cantonese"],
		place: "Kepong",
		yearsExp: 1,
		rating: 4.6,
		trainingLevel: "Tier II",
		totalPaid: 5400,
		attendancePct: 93,
		checkIns: 12,
		checkOuts: 12,
		noShows: 1,
		kpiScore: 80,
		kpiTier: "B",
		tiedSince: "2025-05-15",
		agencyId: "delta",
		avatarPhoto: null,
		comcardImageUrl: null,
	},
]);

/** All managed PRs across operating agencies (Atlas + Delta). */
export const SEED_AGENCY_PRS_ALL: AgencyManagedPR[] = [
	...SEED_AGENCY_PRS,
	...SEED_DELTA_AGENCY_PRS,
];

/** Which operating agency a record belongs to (untagged = Atlas). */
export function agencyIdOf(item: { agencyId?: string }): string {
	return item.agencyId ?? "atlas";
}

/** Whether a PR / record is under an operating agency (owner or multi-agency member). */
export function prIsUnderAgency(
	item: { agencyId?: string; agencyIds?: string[] },
	agencyId: string,
): boolean {
	return (
		agencyIdOf(item) === agencyId ||
		(item.agencyIds?.includes(agencyId) ?? false)
	);
}

/**
 * Filter agency records to one operating agency — visible if the record is OWNED
 * by it (`agencyId`) OR the PR is a MEMBER of it (`agencyIds`, so a PR under many
 * agencies shows in each one's Manage PR list).
 */
export function scopeToAgency<
	T extends { agencyId?: string; agencyIds?: string[] },
>(items: T[], activeAgencyId: string): T[] {
	return items.filter((i) => prIsUnderAgency(i, activeAgencyId));
}

/**
 * Roster rows an operating agency should see: PR is under that agency (including
 * dual-tied members). Orphan / unknown-PR slots fall back to slot ownership.
 */
export function rosterSlotsForAgency(
	slots: AgencyRosterSlot[],
	agencyPRs: Array<{ id: string; agencyId?: string; agencyIds?: string[] }>,
	activeAgencyId: string,
): AgencyRosterSlot[] {
	const prById = new Map(agencyPRs.map((p) => [p.id, p]));
	return slots.filter((slot) => {
		const pr = prById.get(slot.prId);
		if (pr) return prIsUnderAgency(pr, activeAgencyId);
		return agencyIdOf(slot) === activeAgencyId;
	});
}

/**
 * Org label for the agency portal currently being viewed.
 *
 * Same rule as `rosterSlotAgencyName`: a real agency id with no known name
 * yields nothing. This one is worse if it lies — it labels the viewer's OWN
 * organisation, so the demo literal told a real agency owner they were Atlas.
 */
export function agencyPortalLabel(agencyId: string): string {
	const demoName = AGENCY_OWNERS_BY_ID[agencyId]?.orgName;
	if (demoName) return demoName;
	return isRealAgencyId(agencyId) ? "" : DEFAULT_PR_AGENCY_NAME;
}

/**
 * Filter agency records to those OWNED by one operating agency (`agencyId` only —
 * membership via `agencyIds` does NOT count). Use this to scope records that carry
 * no agency tag of their own (PVs, receipts, shift history) — they are attributed to
 * an agency through its owned PRs, so a shared PR (member of many) must not drag another
 * agency's financials into this one. Contrast with {@link scopeToAgency}, which is
 * membership-aware and used for the roster / Manage-PR lists.
 */
export function ownedByAgency<T extends { agencyId?: string }>(
	items: T[],
	activeAgencyId: string,
): T[] {
	return items.filter((i) => agencyIdOf(i) === activeAgencyId);
}

function parsePendingLanguages(raw: string): string[] {
	return raw
		.split(/[·,|/]/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => normalizeLanguageToken(s))
		.filter(Boolean);
}

function normalizeLanguageToken(raw: string): string {
	const t = raw.trim();
	if (!t || t.toLowerCase() === "pending profile") return "";
	const u = t.toUpperCase();
	if (u === "EN") return "English";
	if (t === "中文") return "Mandarin";
	if (u === "MALAY") return "Malay";
	if (u === "MANDARIN") return "Mandarin";
	if (u === "CANTONESE") return "Cantonese";
	if (u === "JAPANESE") return "Japanese";
	if (u === "TAMIL") return "Tamil";
	if (u === "HINDI") return "Hindi";
	if (u === "ARABIC") return "Arabic";
	return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Flatten PR language fields into normalized tokens for filters and display */
export function languagesFromPr(
	pr: Pick<AgencyManagedPR, "languages">,
): string[] {
	const raw = pr.languages as string[] | string | undefined;
	if (Array.isArray(raw)) {
		return [
			...new Set(
				raw.map((l) => normalizeLanguageToken(String(l))).filter(Boolean),
			),
		];
	}
	if (typeof raw === "string") return parsePendingLanguages(raw);
	return [];
}

/** A PR's languages split into the ones a card shows and the ones it hides. */
export interface CardLanguages {
	/** Every language on the account, normalized — the tooltip / title text. */
	all: string[];
	/** The ones that fit. */
	shown: string[];
	/** How many `shown` leaves out. 0 when the card shows them all. */
	hidden: number;
}

/**
 * ONE language renderer for every card, popover and comcard sheet.
 *
 * Four surfaces each truncated on their own — `slice(0, 3)` on the roster
 * popover and the outlet comcard sheet, `slice(0, 2)` on the grid comcard — and
 * only the Manage-PR card said how many it had dropped. That is why a PR who
 * speaks English, Mandarin, Hokkien and Cantonese read as four languages on
 * Manage PR and on her own phone, but as three on the roster with nothing to
 * say a fourth existed. Truncating is a layout decision; SILENTLY truncating is
 * a different fact. Callers render `shown` and, when `hidden > 0`, a "+N" chip
 * carrying `all` as its title.
 */
export function splitCardLanguages(
	pr: Pick<AgencyManagedPR, "languages">,
	max: number,
): CardLanguages {
	const all = languagesFromPr(pr).filter(Boolean);
	return {
		all,
		shown: all.slice(0, max),
		hidden: Math.max(0, all.length - max),
	};
}

/** Push PR portal profile media onto the matching agency roster record */
export function syncAgencyPrFromPrPortal(
	agencyPr: AgencyManagedPR,
	prId: string,
	portal: {
		prDisplayName: string | null;
		prIcName: string | null;
		prMobile: string | null;
		prEmail: string | null;
		prAvatarPhoto: string | null;
		prComcard: PrComcard;
		prPortfolio: (string | null)[];
		prLanguages: string[];
	},
): AgencyManagedPR {
	if (agencyPr.id !== prId) return agencyPr;
	const displayName = portal.prDisplayName?.trim();
	const icName = portal.prIcName?.trim();
	const mobile = portal.prMobile?.trim();
	const email = portal.prEmail?.trim();
	return {
		...agencyPr,
		...(displayName ? { name: displayName } : {}),
		...(icName ? { icName } : {}),
		...(mobile ? { mobile } : {}),
		...(email ? { email } : {}),
		avatarPhoto: portal.prAvatarPhoto ?? agencyPr.avatarPhoto,
		comcardImageUrl: portal.prComcard.imageUrl ?? agencyPr.comcardImageUrl,
		portfolioPhotos: portal.prPortfolio.some(Boolean)
			? portal.prPortfolio
			: agencyPr.portfolioPhotos,
		languages: portal.prLanguages.length
			? portal.prLanguages
			: agencyPr.languages,
		height: portal.prComcard.height,
		weight: portal.prComcard.weight,
		age: portal.prComcard.age,
	};
}

/** All distinct languages across agency PR personnel */
export function collectAgencyPrLanguages(
	prs: AgencyManagedPR[],
	opts?: { includeDetached?: boolean },
): string[] {
	const includeDetached = opts?.includeDetached ?? false;
	const set = new Set<string>();
	for (const pr of prs) {
		if (!includeDetached && pr.detached) continue;
		for (const lang of languagesFromPr(pr)) set.add(lang);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

import { demoPlaceholderImage } from "@agency-portal/lib/demo-placeholder-image";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

function seedPendingDocuments(
	floorName: string,
	legalName: string,
	initial: string,
) {
	const icSize = { w: 480, h: 320 };
	const portrait = { w: 320, h: 400 };
	const square = { w: 400, h: 400 };
	const portfolioPhotos: (string | null)[] = Array.from(
		{ length: 8 },
		() => null,
	);
	for (let i = 0; i < 4; i++) {
		portfolioPhotos[i] = demoPlaceholderImage(
			`Photo ${i + 1}`,
			floorName,
			"#b79ce8",
			square,
		);
	}
	return {
		icPhotoFront: demoPlaceholderImage(
			"IC · Front",
			`${legalName} · NRIC`,
			"#6ee7b7",
			icSize,
		),
		icPhotoBack: demoPlaceholderImage(
			"IC · Back",
			`${legalName} · NRIC`,
			"#6ee7b7",
			icSize,
		),
		selfiePhoto: demoPlaceholderImage(
			initial,
			"Selfie · demo",
			"#C99B4E",
			portrait,
		),
		portfolioPhotos,
		portfolioCount: 4,
	};
}

/** New sign-ups awaiting owner approval — not yet on agency roster */
export const SEED_PENDING_PRS: PendingPR[] = [
	{
		id: "signup-siti",
		targetPrId: "p8",
		name: "Sophie",
		icName: "Siti Rahman",
		languages: "EN · Malay",
		ic: "960101-14-7788",
		mobile: "+60 12-881 9901",
		email: "siti.r@inz.my",
		age: 24,
		height: 165,
		weight: 52,
		race: "Malay",
		hasIcPhotos: true,
		hasSelfie: true,
		...seedPendingDocuments("Sophie", "Siti Rahman", "SO"),
		submittedAt: "9 Jun 2026 · 09:14",
		source: "self-signup",
		status: "pending",
		agencyId: "atlas",
	},
	{
		id: "signup-amira",
		targetPrId: "p9",
		name: "Amber",
		icName: "Amira Hassan",
		languages: "EN · Malay · Arabic",
		ic: "980712-08-4410",
		mobile: "+60 13-220 7788",
		email: "amira.h@inz.my",
		age: 23,
		height: 163,
		weight: 50,
		race: "Malay",
		hasIcPhotos: true,
		hasSelfie: true,
		...seedPendingDocuments("Amber", "Amira Hassan", "AB"),
		submittedAt: "8 Jun 2026 · 22:41",
		source: "self-signup",
		status: "pending",
		agencyId: "atlas",
	},
	// --- Delta Agency's own pending sign-ups (peer-agency demo) ---
	// Sofia/Rina/Mei are already CONFIRMED Delta PRs (see SEED_DELTA_AGENCY_PRS); these
	// are fresh applicants awaiting Delta's approval, scoped so Atlas never sees them.
	{
		id: "signup-nurul",
		name: "Nina",
		icName: "Nurul Aina",
		languages: "EN · Malay",
		ic: "990304-14-5521",
		mobile: "+60 12-664 3390",
		email: "nurul.a@inz.my",
		age: 22,
		height: 162,
		weight: 49,
		race: "Malay",
		hasIcPhotos: true,
		hasSelfie: true,
		...seedPendingDocuments("Nina", "Nurul Aina", "NA"),
		submittedAt: "11 Jul 2026 · 14:08",
		source: "self-signup",
		status: "pending",
		agencyId: "delta",
	},
	{
		id: "signup-chloe",
		name: "Chloe",
		icName: "Chloe Lim",
		languages: "EN · Mandarin · Cantonese",
		ic: "000917-10-4432",
		mobile: "+60 16-228 7745",
		email: "chloe.l@inz.my",
		age: 21,
		height: 166,
		weight: 50,
		race: "Chinese",
		hasIcPhotos: true,
		hasSelfie: true,
		...seedPendingDocuments("Chloe", "Chloe Lim", "CL"),
		submittedAt: "12 Jul 2026 · 20:52",
		source: "self-signup",
		status: "pending",
		agencyId: "delta",
	},
];

/** Dropped from pending sign-ups — male names / legacy demo rows */
export const RETIRED_PENDING_PR_IDS = new Set([
	"signup-raj",
	"signup-kevin-invite",
]);

export function pendingPRToManagedPR(p: PendingPR): AgencyManagedPR {
	const langs =
		p.languages === "Pending profile"
			? ["English"]
			: parsePendingLanguages(p.languages);
	const portfolioPhotos = p.portfolioPhotos?.some(Boolean)
		? p.portfolioPhotos
		: undefined;
	const galleryCount =
		portfolioPhotos?.filter(Boolean).length ?? p.portfolioCount ?? 0;
	const floorName = p.name.trim() || "PR";
	const legalName = p.icName?.trim() || floorName;
	return {
		id: p.targetPrId ?? `p-new-${p.id}`,
		name: floorName,
		icName: legalName,
		ic: p.ic ?? "—",
		mobile: p.mobile ?? "—",
		email: p.email ?? "—",
		age: p.age ?? 22,
		height: p.height ?? 165,
		weight: 52,
		race: p.race ?? "—",
		languages: langs,
		place: "KL",
		yearsExp: p.source === "owner-invite" ? 0 : 1,
		rating: 4.2,
		trainingLevel: galleryCount >= 4 ? "Tier II" : "Tier I",
		totalPaid: 0,
		attendancePct: 0,
		checkIns: 0,
		checkOuts: 0,
		noShows: 0,
		kpiScore: 72,
		...(p.agencyId ? { agencyId: p.agencyId } : {}),
		...(portfolioPhotos ? { portfolioPhotos } : {}),
	};
}

export interface LiveWorkforceEntry {
	id: string;
	prName: string;
	outlet: string;
	status: "on-duty" | "en-route" | "checked-out" | "out";
	checkIn?: string;
	checkOut?: string;
	estPayout: number;
	drinks: number;
	tips: number;
}

export interface OutletPnlRow {
	outlet: string;
	grossRevenue: number;
	prPayout: number;
	agencyNet: number;
	outletNet: number;
	platformFee: number;
}

export const SEED_OUTLET_PNL: OutletPnlRow[] = [
	{
		outlet: "Velvet 23",
		grossRevenue: 14820,
		prPayout: 2180,
		agencyNet: 4200,
		outletNet: 7940,
		platformFee: 741,
	},
	{
		outlet: "Mermate",
		grossRevenue: 9200,
		prPayout: 1640,
		agencyNet: 2800,
		outletNet: 4380,
		platformFee: 460,
	},
	{
		outlet: "Bear Lounge",
		grossRevenue: 7600,
		prPayout: 1420,
		agencyNet: 2100,
		outletNet: 3740,
		platformFee: 380,
	},
	{
		outlet: "Onyx KL",
		grossRevenue: 11200,
		prPayout: 1980,
		agencyNet: 3200,
		outletNet: 5640,
		platformFee: 560,
	},
];

export type AgencySubscriptionPlanId =
	| "starter"
	| "plus"
	| "growth"
	| "enterprise"
	| "scale"
	| "renego";

export interface AgencySubscriptionPlan {
	id: AgencySubscriptionPlanId;
	label: string;
	/** Weekly fee — null when price is negotiated with admin */
	weeklyRm: number | null;
	priceLabel?: string;
	/** Max PVs/week on this plan (upper bound for ranged tiers) */
	pvLimit: number;
	/** Shown on plan cards — e.g. "5 PV/Week" */
	capacityLabel: string;
	description: string;
	/** Requires InnocenZ admin to quote pricing */
	renegotiate?: boolean;
}

export const AGENCY_SUBSCRIPTION_PLANS: AgencySubscriptionPlan[] = [
	{
		id: "starter",
		label: "Starter",
		weeklyRm: 125,
		pvLimit: 5,
		capacityLabel: "5 PV/Week",
		description: "InnocenZ Agency · core portal access",
	},
	{
		id: "plus",
		label: "Plus",
		weeklyRm: 250,
		pvLimit: 10,
		capacityLabel: "6–10 PV/Week",
		description: "Growing roster · payroll & history",
	},
	{
		id: "growth",
		label: "Growth",
		weeklyRm: 500,
		pvLimit: 25,
		capacityLabel: "11–25 PV/Week",
		description: "Expanded roster · payroll & reporting",
	},
	{
		id: "enterprise",
		label: "Enterprise",
		weeklyRm: 1000,
		pvLimit: 75,
		capacityLabel: "26–75 PV/Week",
		description: "Large roster · priority support",
	},
	{
		id: "scale",
		label: "Scale",
		weeklyRm: 1500,
		pvLimit: 150,
		capacityLabel: "76–150 PV/Week",
		description: "High volume · dedicated success",
	},
	{
		id: "renego",
		label: "Custom",
		weeklyRm: null,
		priceLabel: "Renegotiate Price",
		pvLimit: Number.POSITIVE_INFINITY,
		capacityLabel: "151+ PV/Week",
		description: "Enterprise volume · custom terms with InnocenZ admin",
		renegotiate: true,
	},
];

/** Demo billing: 1 PV issued per active PR per payroll week. */
export const AGENCY_PVS_PER_PR_PER_WEEK = 1;

export function resolveAgencySubscriptionPlanForWeeklyPv(
	weeklyPv: number,
): AgencySubscriptionPlan {
	for (const plan of AGENCY_SUBSCRIPTION_PLANS) {
		if (plan.renegotiate) continue;
		if (weeklyPv <= plan.pvLimit) return plan;
	}
	return getAgencySubscriptionPlan("renego");
}

/** Human-readable weekly subscription price for a plan tier. */
export function agencyWeeklyPlanPriceLabel(
	plan: AgencySubscriptionPlan,
	// Required, not optional-with-an-English-default: an optional `t` would let a
	// new call site compile while quietly rendering English.
	t: PortalTranslations,
): string {
	/*
	 * `weeklyRm == null` IS the renegotiated plan, and it is the only plan that
	 * carries a `priceLabel` — so one branch covers both. `plan.priceLabel`
	 * stays on the record (it is data, and the admin tooling reads it); it is
	 * simply no longer the display source, because English prose baked into a
	 * data constant cannot be translated at the call site.
	 */
	if (plan.weeklyRm == null) return t.subscription.priceRenegotiate;
	return fill(t.subscription.perWeekPrice, {
		amount: plan.weeklyRm.toLocaleString("en-MY", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}),
	});
}

/** Resolve billed tier and weekly charge from PVs issued in a payroll week. */
export function agencySubscriptionBillingForWeeklyPv(
	weeklyPv: number,
	t: PortalTranslations,
): {
	plan: AgencySubscriptionPlan;
	weeklyPv: number;
	priceLabel: string;
} {
	const plan = resolveAgencySubscriptionPlanForWeeklyPv(weeklyPv);
	return {
		plan,
		weeklyPv,
		priceLabel: agencyWeeklyPlanPriceLabel(plan, t),
	};
}

export function syncAgencyOwnerSubscriptionPlan(
	owner: AgencyOwnerSettings,
	managedWeekPvs: { weekStartIso?: string; issued: string }[],
	payrollWeekStartIso: string,
): AgencyOwnerSettings {
	const plan = resolveAgencySubscriptionPlanForWeeklyPv(
		agencyWeeklyPvCount(managedWeekPvs, payrollWeekStartIso),
	);
	return { ...owner, subscriptionPlanId: plan.id };
}

export function agencyWeeklyPvCount(
	pvs: { weekStartIso?: string; issued: string }[],
	weekStartIso: string,
): number {
	return pvs.filter((pv) => pv.weekStartIso === weekStartIso).length;
}

export function getAgencySubscriptionPlan(
	id?: AgencySubscriptionPlanId | null,
): AgencySubscriptionPlan {
	return (
		AGENCY_SUBSCRIPTION_PLANS.find((p) => p.id === id) ??
		AGENCY_SUBSCRIPTION_PLANS[0]
	);
}

export interface AgencyOwnerSettings {
	ownerName: string;
	mobile: string;
	email: string;
	ic: string;
	orgName: string;
	otpChannel: "email" | "phone";
	accountActivated: boolean;
	avatarPhoto?: string | null;
	subscriptionPlanId?: AgencySubscriptionPlanId;
}

export const DEFAULT_AGENCY_OWNER: AgencyOwnerSettings = {
	ownerName: "Dato' Lim Wei Khoon",
	mobile: "+60 12-345 6789",
	email: "owner@atlas-agency.my",
	ic: "780101-14-5522",
	orgName: "Atlas Agency",
	otpChannel: "email",
	accountActivated: true,
	avatarPhoto: null,
	subscriptionPlanId: "growth",
};

/** Empty shapes for REAL backend sessions — no Atlas names/emails. */
export const BLANK_AGENCY_OWNER: AgencyOwnerSettings = {
	ownerName: "",
	mobile: "",
	email: "",
	ic: "",
	orgName: "",
	otpChannel: "email",
	accountActivated: false,
	avatarPhoto: null,
	subscriptionPlanId: "starter",
};

export interface AgencyFinanceHead {
	name: string;
	ic: string;
	email: string;
	eSignatureStored: boolean;
	/** Stored e-signature image — stamped on every PV (1st of 2 sigs) */
	signatureDataUrl?: string;
}

export const DEFAULT_FINANCE_HEAD: AgencyFinanceHead = {
	name: "Sarah Tan",
	ic: "850622-08-4410",
	email: "finance@atlas-agency.my",
	eSignatureStored: true,
	signatureDataUrl: buildDemoESignatureDataUrl("Sarah Tan"),
};

export const BLANK_AGENCY_FINANCE_HEAD: AgencyFinanceHead = {
	name: "",
	ic: "",
	email: "",
	eSignatureStored: false,
};

/** Delta Agency — second operating agency, peer to Atlas (owner@delta-agency.my). */
export const DELTA_AGENCY_OWNER: AgencyOwnerSettings = {
	ownerName: "Rajesh Kumar",
	mobile: "+60 16-778 2210",
	email: "owner@delta-agency.my",
	ic: "820714-10-3344",
	orgName: "Delta Agency",
	otpChannel: "email",
	accountActivated: true,
	avatarPhoto: null,
	subscriptionPlanId: "growth",
};

export const DELTA_FINANCE_HEAD: AgencyFinanceHead = {
	name: "Nadia Rahman",
	ic: "880903-06-5521",
	email: "finance@delta-agency.my",
	eSignatureStored: true,
	signatureDataUrl: buildDemoESignatureDataUrl("Nadia Rahman"),
};

/** Owner/finance identity per operating agency id — used to switch portal on login. */
export const AGENCY_OWNERS_BY_ID: Record<string, AgencyOwnerSettings> = {
	atlas: DEFAULT_AGENCY_OWNER,
	delta: DELTA_AGENCY_OWNER,
};

export const AGENCY_FINANCE_HEADS_BY_ID: Record<string, AgencyFinanceHead> = {
	atlas: DEFAULT_FINANCE_HEAD,
	delta: DELTA_FINANCE_HEAD,
};

/** Resolve which operating agency an owner email belongs to (null if not an agency owner). */
export function agencyIdForOwnerEmail(email: string): string | null {
	const e = email.trim().toLowerCase();
	const found = Object.entries(AGENCY_OWNERS_BY_ID).find(
		([, o]) => o.email.toLowerCase() === e,
	);
	return found ? found[0] : null;
}

export type CollectionAging = "current" | "7d" | "14d" | "30d" | "60d+";
export type CollectionStatus = "SETTLED" | "PENDING";

export type CollectionInvoiceKind = "outlet" | "agency";

export type CollectionLineGroup = "payroll" | "commissions" | "fees";

export interface CollectionLineItem {
	label: string;
	detail?: string;
	amount: number;
	group?: CollectionLineGroup;
}

export interface AgencyCollectionInvoice {
	id: string;
	outlet: string;
	amount: number;
	/** Invoice issue date (display) */
	issueDate: string;
	/** Optional issue time for filtering */
	issueTime?: string;
	dueDate: string;
	status: CollectionStatus;
	aging: CollectionAging;
	linkedPvIds: string[];
	/** What the outlet owes the agency — payroll passthrough, fees, etc. */
	lines?: CollectionLineItem[];
	reminderSent?: boolean;
	kind?: CollectionInvoiceKind;
	counterparty?: string;
	/** Operating agency that owns this invoice (defaults to "atlas" when unset). */
	agencyId?: string;
}

export const SEED_AGENCY_COLLECTIONS: AgencyCollectionInvoice[] = [
	{
		id: "COL-2026-0610",
		outlet: "Velvet 23",
		amount: 4280,
		issueDate: "3 Jun 2026",
		issueTime: "09:30",
		dueDate: "10 Jun 2026",
		status: "SETTLED",
		aging: "current",
		linkedPvIds: ["PV-2026-0611-A"],
		kind: "outlet",
		lines: [
			{
				label: "Daily wages",
				detail: "Vicky · 18 Jun sealed shift",
				amount: 360,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Velvet 23 floor · tap log",
				amount: 2940,
				group: "commissions",
			},
			{
				label: "Commission – Tips",
				detail: "100% passthrough to PR payroll",
				amount: 680,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 300,
				group: "fees",
			},
		],
	},
	{
		id: "COL-2026-0608",
		outlet: "Mermate",
		amount: 3120,
		issueDate: "1 Jun 2026",
		issueTime: "11:00",
		dueDate: "8 Jun 2026",
		status: "SETTLED",
		aging: "current",
		linkedPvIds: ["PV-2026-0498", "PV-2026-0548-J"],
		kind: "outlet",
		lines: [
			{
				label: "Daily wages",
				detail: "Bernice · 27 Apr + Hazel · 20–22 May shifts",
				amount: 1050,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Mermate POS reconciled",
				amount: 1620,
				group: "commissions",
			},
			{
				label: "Commission – Tips",
				detail: "Receipt scans rc-seed-1…3",
				amount: 350,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 100,
				group: "fees",
			},
		],
	},
	{
		id: "COL-2026-0605",
		outlet: "Bear Lounge",
		amount: 2640,
		issueDate: "28 May 2026",
		issueTime: "14:15",
		dueDate: "5 Jun 2026",
		status: "PENDING",
		aging: "7d",
		linkedPvIds: ["PV-2026-0521"],
		reminderSent: true,
		kind: "outlet",
		lines: [
			{
				label: "Daily wages",
				detail: "Charlotte · 9 May sealed shift",
				amount: 350,
				group: "payroll",
			},
			{
				label: "Overtime (OT)",
				detail: "Check-out past shift end · 47 min",
				amount: 280,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Disputed · rc-seed-4 · outlet reconciling",
				amount: 1890,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 120,
				group: "fees",
			},
		],
	},
	{
		id: "COL-2026-0528",
		outlet: "Onyx KL",
		amount: 3890,
		issueDate: "21 May 2026",
		issueTime: "10:45",
		dueDate: "28 May 2026",
		status: "PENDING",
		aging: "14d",
		linkedPvIds: [],
		kind: "outlet",
		lines: [
			{
				label: "Daily wages",
				detail: "Alice + guest PR · 2 shifts",
				amount: 1420,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Onyx KL · weekend cycle",
				amount: 1980,
				group: "commissions",
			},
			{
				label: "Commission – Tables",
				detail: "VIP tables · 3 units",
				amount: 360,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 130,
				group: "fees",
			},
		],
	},
	{
		id: "COL-2026-0515",
		outlet: "Urban Soul",
		amount: 1950,
		issueDate: "8 May 2026",
		issueTime: "16:00",
		dueDate: "15 May 2026",
		status: "PENDING",
		aging: "30d",
		linkedPvIds: ["PV-2026-0535-J"],
		reminderSent: true,
		kind: "outlet",
		lines: [
			{
				label: "Daily wages",
				detail: "Grace · 14 May shift",
				amount: 350,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Urban Soul tap log",
				amount: 1420,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 180,
				group: "fees",
			},
		],
	},
	{
		id: "AINV-2026-0601",
		outlet: "Platform fee",
		amount: 500,
		issueDate: "1 Jun 2026",
		issueTime: "08:00",
		dueDate: "1 Jun 2026",
		status: "SETTLED",
		aging: "current",
		linkedPvIds: [],
		kind: "agency",
		counterparty: "InnocenZ Platform",
		lines: [
			{
				label: "Atlas Agency subscription",
				detail: "Jun 2026 · Growth · 20 PVs · weekly",
				amount: 500,
				group: "fees",
			},
		],
	},
];

export interface AgencyReconciliationDay {
	dateIso: string;
	dateLabel: string;
	/** Sun–Sat week start (inclusive). */
	weekStartIso?: string;
	/** Sat week end (inclusive). */
	weekEndIso?: string;
	outletSalesTotal: number;
	pvTotal: number;
	variance: number;
	/** Sum of sealed shift earnings for agency PRs this week (agency–PR reconcile). */
	prIncomeTotal?: number;
	/** PR earnings − PV net for the week. */
	prVariance?: number;
	varianceReason?: string;
	agencyAdjustDrinks?: number;
	agencyAdjustTips?: number;
	agencyAdjustReason?: string;
	agencyConfirmed: boolean;
	outletConfirmed: boolean;
	/** PR ids who confirmed weekly earnings in the PR portal. */
	prConfirmedIds?: string[];
}

export const SEED_RECONCILIATION: AgencyReconciliationDay = {
	dateIso: DEFAULT_ROSTER_DATE_ISO,
	dateLabel: fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO),
	outletSalesTotal: 14820,
	pvTotal: 14760,
	variance: 60,
	prIncomeTotal: 0,
	prVariance: 0,
	agencyConfirmed: false,
	outletConfirmed: true,
	prConfirmedIds: [],
};

export const OUTLET_NAMES = [
	...new Set(OUTLET_COMMISSION_RULES.map((r) => r.outlet)),
];

export function nowAgencyDateTime() {
	const d = new Date();
	return {
		date: d.toLocaleDateString("en-MY", {
			weekday: "short",
			day: "numeric",
			month: "short",
			year: "numeric",
		}),
		time: d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }),
	};
}

const DEMO_LAYOUT_ROSTER_IDS = new Set(["rs2", "rs3", "rs4"]);
/** Demo slots — seed outletSwap state wins on hydrate (clears stale agency swap requests). */
const FORCE_SEED_OUTLET_SWAP_IDS = new Set(["rs1", "rs3"]);
/** Removed from seed — drop stale extras on hydrate */
const RETIRED_DEMO_ROSTER_IDS = new Set([
	"rs-demo-p7",
	"rs7",
	"rs-demo-p3",
	"rs-demo-p4",
	"rs-demo-p5",
]);

/** Placeholder demo PRs removed from Manage PR — migrate roster slots on hydrate. */
export const RETIRED_DEMO_PR_IDS = new Set([
	"p2",
	"p3",
	"p4",
	"p5",
	"p6",
	"p7",
]);

function rosterSlotUsesRetiredPr(
	slot: Pick<AgencyRosterSlot, "prId">,
): boolean {
	return RETIRED_DEMO_PR_IDS.has(slot.prId);
}

function mergeRosterSlotFromSeed(
	saved: AgencyRosterSlot,
	seedSlot: AgencyRosterSlot,
	dateIso: string,
): AgencyRosterSlot {
	const preserveFloor = saved.status === "on-duty" && !!saved.checkedInAt;
	return {
		...seedSlot,
		dateIso,
		prId: seedSlot.prId,
		prName: seedSlot.prName,
		outlet: seedSlot.outlet,
		status: preserveFloor ? saved.status : seedSlot.status,
		checkedInAt: preserveFloor ? saved.checkedInAt : seedSlot.checkedInAt,
		floorDrinks: preserveFloor
			? (saved.floorDrinks ?? seedSlot.floorDrinks)
			: seedSlot.floorDrinks,
		floorTips: preserveFloor
			? (saved.floorTips ?? seedSlot.floorTips)
			: seedSlot.floorTips,
		estPayout: preserveFloor
			? (saved.estPayout ?? seedSlot.estPayout)
			: seedSlot.estPayout,
		outletSwap: seedSlot.outletSwap ?? saved.outletSwap,
		agencyAssignment: seedSlot.agencyAssignment ?? saved.agencyAssignment,
	};
}

/** Prefer canonical agency PR name over stale roster slot labels (e.g. Luna → Vicky). */
export function resolveRosterPrName(
	prId: string,
	rosterName?: string,
	agencyPRs?: { id: string; name: string }[],
): string {
	const canonical = agencyPRs?.find((p) => p.id === prId)?.name?.trim();
	if (canonical) return canonical;
	if (rosterName === "Luna" && prId === TIED_DEMO_ROSTER_PR_ID) return "Vicky";
	return rosterName?.trim() || prId;
}

/** Match a shift-history / roster row to the agency PR record. */
export function findAgencyManagedPr(
	agencyPRs: AgencyManagedPR[],
	prId: string,
	prName?: string,
): AgencyManagedPR | undefined {
	const byId = agencyPRs.find((p) => p.id === prId);
	if (byId) return byId;
	const name = prName?.trim();
	if (!name) return undefined;
	const lower = name.toLowerCase();
	return agencyPRs.find(
		(p) =>
			p.name === name ||
			p.icName === name ||
			p.name.toLowerCase() === lower ||
			p.icName.toLowerCase() === lower,
	);
}

/** Best available profile image for outlet/agency PR cards. */
export function resolveAgencyPrPhoto(
	pr: Pick<
		AgencyManagedPR,
		"avatarPhoto" | "comcardImageUrl" | "portfolioPhotos"
	>,
): string | null {
	if (pr.avatarPhoto) return pr.avatarPhoto;
	if (pr.comcardImageUrl) return pr.comcardImageUrl;
	const portfolio = pr.portfolioPhotos?.find(Boolean);
	return portfolio ?? null;
}

function mergeRosterSlotPrName(
	saved: AgencyRosterSlot,
	seedSlot: AgencyRosterSlot,
	reassigned: boolean,
): string {
	if (reassigned) return saved.prName;
	if (saved.prName === "Luna" && seedSlot.prName !== "Luna")
		return seedSlot.prName;
	return saved.prName ?? seedSlot.prName;
}

/** Keep demo agency inbox (assignments / swaps) visible after localStorage hydrate */
export function mergeAgencyRoster(
	persisted: AgencyRosterSlot[] | undefined,
	seed: AgencyRosterSlot[] = SEED_AGENCY_ROSTER,
): AgencyRosterSlot[] {
	const normalize = (slot: AgencyRosterSlot): AgencyRosterSlot => {
		const dateIso = migrateDemoDateIso(slot.dateIso);
		return withRosterDate({ ...slot, dateIso });
	};

	if (!persisted?.length) return seed.map(normalize);
	const seedIds = new Set(seed.map((s) => s.id));
	const extras = persisted
		.filter(
			(s) =>
				!seedIds.has(s.id) &&
				!RETIRED_DEMO_ROSTER_IDS.has(s.id) &&
				!rosterSlotUsesRetiredPr(s),
		)
		.map((slot) =>
			slot.prId === TIED_DEMO_ROSTER_PR_ID && slot.prName === "Luna"
				? { ...slot, prName: "Vicky" }
				: slot,
		);
	const merged = [
		...extras,
		...seed.map((seedSlot) => {
			const saved = persisted.find((s) => s.id === seedSlot.id);
			if (!saved) return seedSlot;
			const dateIso = migrateDemoDateIso(
				saved.dateIso < DEFAULT_ROSTER_DATE_ISO &&
					seedSlot.dateIso >= DEFAULT_ROSTER_DATE_ISO
					? seedSlot.dateIso
					: (saved.dateIso ?? seedSlot.dateIso),
			);
			if (rosterSlotUsesRetiredPr(saved)) {
				return normalize(mergeRosterSlotFromSeed(saved, seedSlot, dateIso));
			}
			if (DEMO_LAYOUT_ROSTER_IDS.has(seedSlot.id)) {
				const layoutReassigned = saved.prId !== seedSlot.prId;
				return normalize({
					...seedSlot,
					...saved,
					status: seedSlot.status,
					dateIso,
					outlet: seedSlot.outlet,
					prId: layoutReassigned ? saved.prId : (saved.prId ?? seedSlot.prId),
					prName: mergeRosterSlotPrName(saved, seedSlot, layoutReassigned),
					checkedInAt: saved.checkedInAt ?? seedSlot.checkedInAt,
					floorDrinks: saved.floorDrinks ?? seedSlot.floorDrinks,
					floorTips: saved.floorTips ?? seedSlot.floorTips,
					estPayout: saved.estPayout ?? seedSlot.estPayout,
					outletSwap: seedSlot.outletSwap ?? saved.outletSwap,
				});
			}
			const keepAssignmentPending =
				seedSlot.status === "assignment-pending" &&
				saved.status !== "scheduled";
			const keepOutletRequestPending =
				seedSlot.status === "outlet-request-pending" &&
				saved.status !== "scheduled" &&
				saved.status !== "assignment-pending";
			const keepSwapPending =
				seedSlot.outletSwap?.status === "pending_pr" &&
				saved.outletSwap?.status !== "approved";
			const preserveLiveOnDuty =
				saved.status === "on-duty" &&
				seedSlot.status !== "on-duty" &&
				!!saved.checkedInAt;
			const staleOnDuty =
				saved.status === "on-duty" &&
				seedSlot.status !== "on-duty" &&
				!saved.checkedInAt;
			const seedFloorActive =
				seedSlot.status === "en-route" ||
				(seedSlot.status === "on-duty" && !!seedSlot.checkedInAt);
			const savedFloorIdle = saved.status === "scheduled" && !saved.checkedInAt;
			const restoreSeedFloor =
				seedFloorActive &&
				savedFloorIdle &&
				!preserveLiveOnDuty &&
				!staleOnDuty;
			const reassigned =
				!rosterSlotUsesRetiredPr(saved) && saved.prId !== seedSlot.prId;
			return normalize({
				...seedSlot,
				...saved,
				dateIso,
				prId: reassigned ? saved.prId : (saved.prId ?? seedSlot.prId),
				prName: mergeRosterSlotPrName(saved, seedSlot, reassigned),
				status: keepOutletRequestPending
					? seedSlot.status
					: keepAssignmentPending
						? seedSlot.status
						: preserveLiveOnDuty
							? "on-duty"
							: staleOnDuty
								? seedSlot.status
								: restoreSeedFloor
									? seedSlot.status
									: saved.status,
				checkedInAt: preserveLiveOnDuty
					? saved.checkedInAt
					: staleOnDuty
						? undefined
						: restoreSeedFloor
							? seedSlot.checkedInAt
							: (saved.checkedInAt ?? seedSlot.checkedInAt),
				floorDrinks:
					staleOnDuty || restoreSeedFloor
						? seedSlot.floorDrinks
						: (saved.floorDrinks ?? seedSlot.floorDrinks),
				floorTips:
					staleOnDuty || restoreSeedFloor
						? seedSlot.floorTips
						: (saved.floorTips ?? seedSlot.floorTips),
				agencyAssignment:
					keepOutletRequestPending || keepAssignmentPending
						? seedSlot.agencyAssignment
						: (saved.agencyAssignment ?? seedSlot.agencyAssignment),
				outletSwap: FORCE_SEED_OUTLET_SWAP_IDS.has(seedSlot.id)
					? seedSlot.outletSwap
					: keepSwapPending
						? seedSlot.outletSwap
						: (saved.outletSwap ?? seedSlot.outletSwap),
			});
		}),
	];
	return merged.map(normalize);
}
