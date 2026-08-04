import type { AgencyReconciliationDay } from "@agency-portal/lib/agency-demo";
import {
	recomputeReconciliation,
	sumPvNetForCycle,
} from "@agency-portal/lib/portal-sync";
import {
	type PrPaymentVoucher,
	type PrPvStatus,
	parsePvIssuedMs,
} from "@agency-portal/lib/pr-demo";
import { shiftRowIncomeBreakdown } from "@agency-portal/lib/pr-weekly-payment";
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import {
	VELVET_OUTLET_NAME,
	VELVET_WEEKLY_NIGHTS,
} from "@agency-portal/lib/velvet-week-demo";

/** Week runs Sunday → Saturday (local calendar). */
export function isoDateLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function parseIsoDateLocal(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function dateIsoInRange(
	iso: string,
	startIso: string,
	endIso: string,
): boolean {
	return iso >= startIso && iso <= endIso;
}

export function isWeeklyReconciliationSunday(ref = new Date()): boolean {
	return ref.getDay() === 0;
}

/** On Sunday, reconcile the Sun–Sat week that ended yesterday (Saturday). */
export function getWeeklyReconciliationPeriod(ref = new Date()): {
	weekStartIso: string;
	weekEndIso: string;
	dateLabel: string;
} | null {
	if (!isWeeklyReconciliationSunday(ref)) return null;

	const saturday = new Date(ref);
	saturday.setDate(saturday.getDate() - 1);
	const sunday = new Date(saturday);
	sunday.setDate(sunday.getDate() - 6);

	const weekStartIso = isoDateLocal(sunday);
	const weekEndIso = isoDateLocal(saturday);
	return {
		weekStartIso,
		weekEndIso,
		dateLabel: formatWeekRangeLabel(weekStartIso, weekEndIso),
	};
}

export function formatWeekRangeLabel(
	weekStartIso: string,
	weekEndIso: string,
): string {
	const fmt = (iso: string) =>
		parseIsoDateLocal(iso).toLocaleDateString("en-MY", {
			day: "numeric",
			month: "short",
		});
	const y = parseIsoDateLocal(weekEndIso).getFullYear();
	return `Week ${fmt(weekStartIso)} – ${fmt(weekEndIso)} ${y}`;
}

export function formatIncomeCutoffLabel(weekEndIso: string): string {
	const d = parseIsoDateLocal(weekEndIso);
	return d.toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export interface PrReconciliationIncome {
	prId: string;
	prName: string;
	shiftCount: number;
	outlets: string[];
	wagesRm: number;
	drinksRm: number;
	tipsRm: number;
	tablesRm: number;
	totalRm: number;
	cutoffIso: string;
	cutoffLabel: string;
	weekLabel: string;
	pvId?: string;
	pvStatus?: PrPvStatus;
	/** Linked PV net payable for the same week (if raised). */
	pvNetRm?: number;
	prConfirmed: boolean;
}

function incomeFromShiftRow(row: ShiftHistoryRow): {
	wagesRm: number;
	drinksRm: number;
	tipsRm: number;
	tablesRm: number;
	totalRm: number;
} {
	const b = shiftRowIncomeBreakdown(row);
	const totalRm = b.wages + b.drinks + b.tips + b.others;
	return {
		wagesRm: b.wages,
		drinksRm: b.drinks,
		tipsRm: b.tips,
		tablesRm: b.others,
		totalRm,
	};
}

function pvForPrInWeek(
	pvs: PrPaymentVoucher[],
	prName: string,
	weekStartIso: string,
	weekEndIso: string,
): PrPaymentVoucher | undefined {
	return pvs.find(
		(p) => p.prName === prName && pvBelongsToWeek(p, weekStartIso, weekEndIso),
	);
}

/** Agency–PR weekly income rows from sealed shifts + linked PV status. */
export function buildPrReconciliationIncomes(input: {
	shiftHistory: ShiftHistoryRow[];
	pvs: PrPaymentVoucher[];
	weekStartIso: string;
	weekEndIso: string;
	weekLabel: string;
	prConfirmedIds?: string[];
}): PrReconciliationIncome[] {
	const cutoffLabel = formatIncomeCutoffLabel(input.weekEndIso);
	const byPr = new Map<string, PrReconciliationIncome>();

	for (const row of input.shiftHistory) {
		if (!dateIsoInRange(row.dateIso, input.weekStartIso, input.weekEndIso))
			continue;
		const inc = incomeFromShiftRow(row);
		const existing = byPr.get(row.prId);
		if (existing) {
			existing.shiftCount += 1;
			existing.wagesRm += inc.wagesRm;
			existing.drinksRm += inc.drinksRm;
			existing.tipsRm += inc.tipsRm;
			existing.tablesRm += inc.tablesRm;
			existing.totalRm += inc.totalRm;
			if (!existing.outlets.includes(row.outlet))
				existing.outlets.push(row.outlet);
		} else {
			const pv = pvForPrInWeek(
				input.pvs,
				row.prName,
				input.weekStartIso,
				input.weekEndIso,
			);
			byPr.set(row.prId, {
				prId: row.prId,
				prName: row.prName,
				shiftCount: 1,
				outlets: [row.outlet],
				wagesRm: inc.wagesRm,
				drinksRm: inc.drinksRm,
				tipsRm: inc.tipsRm,
				tablesRm: inc.tablesRm,
				totalRm: inc.totalRm,
				cutoffIso: input.weekEndIso,
				cutoffLabel,
				weekLabel: input.weekLabel,
				pvId: pv?.id,
				pvStatus: pv?.status,
				pvNetRm: pv?.net,
				prConfirmed: (input.prConfirmedIds ?? []).includes(row.prId),
			});
		}
	}

	for (const income of byPr.values()) {
		if (!income.pvId) {
			const pv = pvForPrInWeek(
				input.pvs,
				income.prName,
				input.weekStartIso,
				input.weekEndIso,
			);
			if (pv) {
				income.pvId = pv.id;
				income.pvStatus = pv.status;
				income.pvNetRm = pv.net;
			}
		}
		income.wagesRm = Math.round(income.wagesRm * 100) / 100;
		income.drinksRm = Math.round(income.drinksRm * 100) / 100;
		income.tipsRm = Math.round(income.tipsRm * 100) / 100;
		income.tablesRm = Math.round(income.tablesRm * 100) / 100;
		income.totalRm = Math.round(income.totalRm * 100) / 100;
		income.outlets.sort();
	}

	return [...byPr.values()].sort((a, b) => b.totalRm - a.totalRm);
}

const RECON_VARIANCE_EPS = 0.01;

/** Per-PR shift total minus PV net (positive = shifts exceed PV). */
export function prReconciliationVariance(row: PrReconciliationIncome): number {
	const pvNet = row.pvNetRm ?? 0;
	return Math.round((row.totalRm - pvNet) * 100) / 100;
}

/** Option B: expand PV / breakdown only when disputed or amounts differ. */
export function prReconciliationNeedsDetail(
	row: PrReconciliationIncome,
): boolean {
	if (row.pvStatus === "DISPUTED") return true;
	return Math.abs(prReconciliationVariance(row)) > RECON_VARIANCE_EPS;
}

export function prReconciliationAttentionCount(
	incomes: PrReconciliationIncome[],
): number {
	return incomes.filter(prReconciliationNeedsDetail).length;
}

export function sumPrReconciliationIncome(
	incomes: PrReconciliationIncome[],
): number {
	return Math.round(incomes.reduce((s, r) => s + r.totalRm, 0) * 100) / 100;
}

export function allPrsConfirmedForWeek(
	incomes: PrReconciliationIncome[],
	prConfirmedIds: string[] | undefined,
): boolean {
	if (incomes.length === 0) return true;
	const confirmed = new Set(prConfirmedIds ?? []);
	return incomes.every((r) => confirmed.has(r.prId));
}

export function prConfirmationSummary(
	incomes: PrReconciliationIncome[],
	prConfirmedIds: string[] | undefined,
): { confirmed: number; total: number } {
	const confirmed = new Set(prConfirmedIds ?? []);
	return {
		confirmed: incomes.filter((r) => confirmed.has(r.prId)).length,
		total: incomes.length,
	};
}

export function shouldShowWeeklyReconciliation(
	reconciliation: AgencyReconciliationDay,
	ref = new Date(),
): boolean {
	const period = getWeeklyReconciliationPeriod(ref);
	if (!period) return false;
	if (!reconciliation.weekEndIso) return true;
	return reconciliation.weekEndIso === period.weekEndIso;
}

function sumVelvetSalesInRange(
	weekStartIso: string,
	weekEndIso: string,
): number {
	return VELVET_WEEKLY_NIGHTS.filter((n) =>
		dateIsoInRange(n.dateIso, weekStartIso, weekEndIso),
	).reduce((sum, n) => sum + n.sales, 0);
}

function estimateOutletSalesFromShift(row: ShiftHistoryRow): number {
	return (
		Math.round(
			(row.totalDrinks * 14 + row.totalTips * 6 + row.totalPayout * 1.8) * 100,
		) / 100
	);
}

/** Agency-wide outlet sales for a Sun–Sat week. */
export function sumAgencyOutletSalesForWeek(
	shiftHistory: ShiftHistoryRow[],
	weekStartIso: string,
	weekEndIso: string,
): number {
	const velvetDates = new Set(
		VELVET_WEEKLY_NIGHTS.filter((n) =>
			dateIsoInRange(n.dateIso, weekStartIso, weekEndIso),
		).map((n) => n.dateIso),
	);

	let total = sumVelvetSalesInRange(weekStartIso, weekEndIso);

	for (const row of shiftHistory) {
		if (!dateIsoInRange(row.dateIso, weekStartIso, weekEndIso)) continue;
		if (row.outlet === VELVET_OUTLET_NAME && velvetDates.has(row.dateIso))
			continue;
		total += estimateOutletSalesFromShift(row);
	}

	return Math.round(total * 100) / 100;
}

function pvBelongsToWeek(
	p: PrPaymentVoucher,
	weekStartIso: string,
	weekEndIso: string,
): boolean {
	if (p.weekStartIso && p.weekEndIso) {
		return p.weekStartIso === weekStartIso && p.weekEndIso === weekEndIso;
	}
	const issuedIso = isoDateLocal(new Date(parsePvIssuedMs(p.issued)));
	return dateIsoInRange(issuedIso, weekStartIso, weekEndIso);
}

export function sumPvNetForWeek(
	pvs: PrPaymentVoucher[],
	weekStartIso: string,
	weekEndIso: string,
): number {
	const filtered = pvs.filter((p) =>
		pvBelongsToWeek(p, weekStartIso, weekEndIso),
	);
	return sumPvNetForCycle(filtered);
}

export function recomputeWeeklyReconciliation(input: {
	shiftHistory: ShiftHistoryRow[];
	pvs: PrPaymentVoucher[];
	weekStartIso: string;
	weekEndIso: string;
	dateLabel: string;
	agencyConfirmed: boolean;
	outletConfirmed: boolean;
	varianceReason?: string;
	agencyAdjustDrinks?: number;
	agencyAdjustTips?: number;
	agencyAdjustReason?: string;
	prConfirmedIds?: string[];
}): AgencyReconciliationDay {
	const outletGross = sumAgencyOutletSalesForWeek(
		input.shiftHistory,
		input.weekStartIso,
		input.weekEndIso,
	);
	const pvTotal = sumPvNetForWeek(
		input.pvs,
		input.weekStartIso,
		input.weekEndIso,
	);
	const prIncomes = buildPrReconciliationIncomes({
		shiftHistory: input.shiftHistory,
		pvs: input.pvs,
		weekStartIso: input.weekStartIso,
		weekEndIso: input.weekEndIso,
		weekLabel: input.dateLabel,
		prConfirmedIds: input.prConfirmedIds,
	});
	const prIncomeTotal = sumPrReconciliationIncome(prIncomes);
	const prVariance = Math.round((prIncomeTotal - pvTotal) * 100) / 100;
	const base = recomputeReconciliation({
		outletGross,
		pvTotal,
		dateIso: input.weekEndIso,
		dateLabel: input.dateLabel,
		agencyConfirmed: input.agencyConfirmed,
		outletConfirmed: input.outletConfirmed,
	});
	return {
		...base,
		weekStartIso: input.weekStartIso,
		weekEndIso: input.weekEndIso,
		prIncomeTotal,
		prVariance,
		varianceReason: input.varianceReason,
		agencyAdjustDrinks: input.agencyAdjustDrinks,
		agencyAdjustTips: input.agencyAdjustTips,
		agencyAdjustReason: input.agencyAdjustReason,
		prConfirmedIds: input.prConfirmedIds,
	};
}

export function buildReconciliationFromLedger(
	st: {
		agencyReconciliation: AgencyReconciliationDay;
		shiftHistory: ShiftHistoryRow[];
		prPaymentVouchers: PrPaymentVoucher[];
	},
	patch: {
		shiftHistory?: ShiftHistoryRow[];
		prPaymentVouchers?: PrPaymentVoucher[];
	} = {},
	ref = new Date(),
): AgencyReconciliationDay {
	const period = getWeeklyReconciliationPeriod(ref);
	const prev = st.agencyReconciliation;
	if (!period) return prev;

	const shiftHistory = patch.shiftHistory ?? st.shiftHistory;
	const pvs = patch.prPaymentVouchers ?? st.prPaymentVouchers;
	const isNewWeek = prev.weekEndIso !== period.weekEndIso;

	return recomputeWeeklyReconciliation({
		shiftHistory,
		pvs,
		weekStartIso: period.weekStartIso,
		weekEndIso: period.weekEndIso,
		dateLabel: period.dateLabel,
		agencyConfirmed: isNewWeek ? false : prev.agencyConfirmed,
		outletConfirmed: isNewWeek ? false : prev.outletConfirmed,
		varianceReason: isNewWeek ? undefined : prev.varianceReason,
		agencyAdjustDrinks: isNewWeek ? undefined : prev.agencyAdjustDrinks,
		agencyAdjustTips: isNewWeek ? undefined : prev.agencyAdjustTips,
		agencyAdjustReason: isNewWeek ? undefined : prev.agencyAdjustReason,
		prConfirmedIds: isNewWeek ? [] : prev.prConfirmedIds,
	});
}

/** Fixed Sun–Sat demo week aligned with velvet seed (1–7 Jun 2026). */
export const DEMO_RECONCILIATION_WEEK = {
	weekStartIso: "2026-06-01",
	weekEndIso: "2026-06-07",
	dateLabel: formatWeekRangeLabel("2026-06-01", "2026-06-07"),
} as const;
