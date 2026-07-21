/**
 * History money helpers — Received (outlet sales) vs Payout (PR take-home via Workspace rates).
 */
import {
	calcShiftPayout,
	type OutletCommissionRule,
} from "@agency-portal/lib/agency-demo";
import type { PrPayClass } from "@agency-portal/lib/pr-penalties";
import {
	SHIFT_HISTORY_FALLBACK_PER_DRINK_RM,
	type ShiftHistoryRow,
} from "@agency-portal/lib/shift-history-utils";

export { SHIFT_HISTORY_FALLBACK_PER_DRINK_RM };

export type ShiftHistoryMoneyBreakdown = {
	drinkSalesRm: number;
	tipSalesRm: number;
	totalReceived: number;
	drinkUnits: number;
	wagesRm: number;
	otRm: number;
	drinkCommissionRm: number;
	tipCommissionRm: number;
	totalPayout: number;
};

export function deriveHistoryDrinkSalesRm(
	drinkUnits: number,
	perDrinkRm = SHIFT_HISTORY_FALLBACK_PER_DRINK_RM,
): number {
	return Math.round(drinkUnits * perDrinkRm * 100) / 100;
}

/** Prefer stored drink sales; fall back to units × typical Workspace drink price. */
export function resolveShiftDrinkSalesRm(
	row: Pick<ShiftHistoryRow, "drinkSalesRm" | "totalDrinks">,
	perDrinkRm = SHIFT_HISTORY_FALLBACK_PER_DRINK_RM,
): number {
	if (
		typeof row.drinkSalesRm === "number" &&
		Number.isFinite(row.drinkSalesRm)
	) {
		return Math.round(row.drinkSalesRm * 100) / 100;
	}
	return deriveHistoryDrinkSalesRm(row.totalDrinks, perDrinkRm);
}

/** Full amount the PR generated for the outlet (drink sales + tip sales). */
export function shiftHistoryTotalReceived(
	row: Pick<ShiftHistoryRow, "drinkSalesRm" | "totalDrinks" | "totalTips">,
	perDrinkRm = SHIFT_HISTORY_FALLBACK_PER_DRINK_RM,
): number {
	return (
		Math.round(
			(resolveShiftDrinkSalesRm(row, perDrinkRm) + row.totalTips) * 100,
		) / 100
	);
}

function roundRm(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Seal-time / demo amounts using Workspace commission rules (not flat RM15/drink). */
export function sealShiftHistoryAmounts(input: {
	outlet: string;
	drinkUnits: number;
	tipSalesRm: number;
	tableUnits?: number;
	hoursWorked: number;
	perDrinkRm?: number;
	drinkSalesRm?: number;
	rules?: OutletCommissionRule[];
	prTier?: string;
	payClass?: PrPayClass;
}): {
	totalDrinks: number;
	drinkSalesRm: number;
	totalTips: number;
	totalTables: number;
	totalPayout: number;
	totalReceived: number;
	wagesRm: number;
	otRm: number;
	drinkCommissionRm: number;
	tipCommissionRm: number;
} {
	const drinkSalesRm =
		input.drinkSalesRm != null
			? roundRm(input.drinkSalesRm)
			: deriveHistoryDrinkSalesRm(input.drinkUnits, input.perDrinkRm);
	const tipSalesRm = roundRm(input.tipSalesRm);
	const payout = calcShiftPayout(
		{
			outlet: input.outlet,
			hoursWorked: input.hoursWorked,
			drinks: input.drinkUnits,
			drinkSales: drinkSalesRm,
			tips: tipSalesRm,
			prTier: input.prTier,
		},
		input.rules,
	);
	// Commission-only PRs earn no base wage or OT — only drink/tip commission.
	const commissionOnly = input.payClass === "commissionOnly";
	const otRm = commissionOnly ? 0 : roundRm(payout.otSupplement);
	const wagesRm = commissionOnly ? 0 : roundRm(payout.shiftPay);
	return {
		totalDrinks: input.drinkUnits,
		drinkSalesRm,
		totalTips: tipSalesRm,
		totalTables: input.tableUnits ?? 0,
		totalPayout: roundRm(
			wagesRm + otRm + payout.drinkCommission + payout.tipCommission,
		),
		totalReceived: roundRm(drinkSalesRm + tipSalesRm),
		wagesRm,
		otRm,
		drinkCommissionRm: payout.drinkCommission,
		tipCommissionRm: payout.tipCommission,
	};
}

function hasStoredPayoutBreakdown(
	row: Pick<
		ShiftHistoryRow,
		| "wagesRm"
		| "drinkCommissionRm"
		| "tipCommissionRm"
		| "otRm"
	>,
): boolean {
	return (
		typeof row.wagesRm === "number" ||
		typeof row.drinkCommissionRm === "number" ||
		typeof row.tipCommissionRm === "number"
	);
}

/** Legacy/bug: tip commission was stored as 100% of tip sales (RECEIPT tipRate: 1). */
export function tipCommissionIgnoresWorkspacePct(
	row: Pick<ShiftHistoryRow, "totalTips" | "tipCommissionRm">,
): boolean {
	const tips = row.totalTips;
	const tipComm = row.tipCommissionRm;
	if (tipComm == null || tips <= 0) return false;
	return Math.abs(tipComm - tips) < 0.05;
}

/** Resolve received + payout line items for one shift (Workspace rates; reseal legacy 100% tips). */
export function resolveShiftHistoryBreakdown(
	row: ShiftHistoryRow,
	opts?: {
		rules?: OutletCommissionRule[];
		prTier?: string;
		perDrinkRm?: number;
		payClass?: PrPayClass;
	},
): ShiftHistoryMoneyBreakdown {
	const sealed = sealShiftHistoryAmounts({
		outlet: row.outlet,
		drinkUnits: row.totalDrinks,
		tipSalesRm: row.totalTips,
		tableUnits: row.totalTables ?? 0,
		hoursWorked: row.durationHours || 6,
		drinkSalesRm: row.drinkSalesRm,
		perDrinkRm: opts?.perDrinkRm,
		rules: opts?.rules,
		prTier: opts?.prTier,
		payClass: opts?.payClass,
	});

	const drinkSalesRm = resolveShiftDrinkSalesRm(row, opts?.perDrinkRm);
	const tipSalesRm = roundRm(row.totalTips);
	const useStored =
		hasStoredPayoutBreakdown(row) && !tipCommissionIgnoresWorkspacePct(row);

	if (useStored) {
		const wagesRm = roundRm(row.wagesRm ?? 0);
		const otRm = roundRm(row.otRm ?? 0);
		const drinkCommissionRm = roundRm(row.drinkCommissionRm ?? 0);
		const tipCommissionRm = roundRm(row.tipCommissionRm ?? 0);
		const partsSum = wagesRm + otRm + drinkCommissionRm + tipCommissionRm;
		const resolvedPayout =
			row.totalPayout > 0 ? roundRm(row.totalPayout) : partsSum;
		return {
			drinkSalesRm,
			tipSalesRm,
			totalReceived: roundRm(drinkSalesRm + tipSalesRm),
			drinkUnits: row.totalDrinks,
			wagesRm,
			otRm,
			drinkCommissionRm,
			tipCommissionRm,
			totalPayout: resolvedPayout,
		};
	}

	// Prefer Workspace-derived payout parts (tip % / drink % from outlet rules).
	return {
		drinkSalesRm,
		tipSalesRm,
		totalReceived: roundRm(drinkSalesRm + tipSalesRm),
		drinkUnits: row.totalDrinks,
		wagesRm: sealed.wagesRm,
		otRm: sealed.otRm,
		drinkCommissionRm: sealed.drinkCommissionRm,
		tipCommissionRm: sealed.tipCommissionRm,
		totalPayout: sealed.totalPayout,
	};
}

/** Sum breakdowns across filtered shifts (PR detail sheet). */
export function sumShiftHistoryBreakdowns(
	rows: ShiftHistoryRow[],
	opts?: {
		rules?: OutletCommissionRule[];
		prTier?: string;
		perDrinkRm?: number;
	},
): ShiftHistoryMoneyBreakdown {
	const empty: ShiftHistoryMoneyBreakdown = {
		drinkSalesRm: 0,
		tipSalesRm: 0,
		totalReceived: 0,
		drinkUnits: 0,
		wagesRm: 0,
		otRm: 0,
		drinkCommissionRm: 0,
		tipCommissionRm: 0,
		totalPayout: 0,
	};
	return (rows ?? []).reduce((acc, row) => {
		const b = resolveShiftHistoryBreakdown(row, opts);
		return {
			drinkSalesRm: roundRm(acc.drinkSalesRm + b.drinkSalesRm),
			tipSalesRm: roundRm(acc.tipSalesRm + b.tipSalesRm),
			totalReceived: roundRm(acc.totalReceived + b.totalReceived),
			drinkUnits: acc.drinkUnits + b.drinkUnits,
			wagesRm: roundRm(acc.wagesRm + b.wagesRm),
			otRm: roundRm(acc.otRm + b.otRm),
			drinkCommissionRm: roundRm(acc.drinkCommissionRm + b.drinkCommissionRm),
			tipCommissionRm: roundRm(acc.tipCommissionRm + b.tipCommissionRm),
			totalPayout: roundRm(acc.totalPayout + b.totalPayout),
		};
	}, empty);
}

/** Fields to spread onto a ShiftHistoryRow after sealing. */
export function sealedAmountsToHistoryFields(
	sealed: ReturnType<typeof sealShiftHistoryAmounts>,
): Pick<
	ShiftHistoryRow,
	| "totalDrinks"
	| "drinkSalesRm"
	| "totalTips"
	| "totalTables"
	| "totalPayout"
	| "wagesRm"
	| "otRm"
	| "drinkCommissionRm"
	| "tipCommissionRm"
> {
	return {
		totalDrinks: sealed.totalDrinks,
		drinkSalesRm: sealed.drinkSalesRm,
		totalTips: sealed.totalTips,
		totalTables: sealed.totalTables,
		totalPayout: sealed.totalPayout,
		wagesRm: sealed.wagesRm,
		otRm: sealed.otRm,
		drinkCommissionRm: sealed.drinkCommissionRm,
		tipCommissionRm: sealed.tipCommissionRm,
	};
}
