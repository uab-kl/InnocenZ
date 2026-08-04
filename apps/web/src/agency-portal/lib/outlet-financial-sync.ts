import type {
	OutletCommissionRule,
	OutletPrTier,
	OutletTierRateSettings,
} from "@agency-portal/lib/agency-demo";
import {
	type AgencyRosterSlot,
	calcShiftPayout,
	getOutletRule,
	OUTLET_BASE_TIER,
	OUTLET_COMMISSION_RULES,
	type OutletPnlRow,
	SEED_OUTLET_PNL,
	tierOtRmPerHour,
} from "@agency-portal/lib/agency-demo";
import { resolveOutletShiftDateIso } from "@agency-portal/lib/agency-outlet-shifts";
import {
	averageDrinkPrice,
	effectiveShiftDrinkMenu,
	effectiveShiftPayTierId,
	findOutletShiftForRosterSlot,
	happyHourWindowHours,
	type OutletCutLossShiftSlice,
	type OutletDrinkPrice,
	outletShiftActivePrIds,
	outletShiftActualLaborCostForShift,
	outletShiftTargetLaborCost,
	resolveOutletPrTier,
	resolveShiftRateForPayTier,
	resolveShiftTierRates,
	shiftHoursFromLabel,
	shiftStartTimeFromLabel,
	typicalDrinkPrice,
} from "@agency-portal/lib/outlet-demo";
import {
	DEFAULT_DRINK_UNITS,
	DEFAULT_PER_DRINK_RM,
	DEFAULT_PER_TABLE_RM,
	DEFAULT_TABLE_UNITS,
} from "@agency-portal/lib/outlet-financial-defaults";
import {
	floorTipsForOutletFromRoster,
	outletMatches,
} from "@agency-portal/lib/portal-sync";
import {
	type CommissionOnlyRateSettings,
	defaultCommissionOnlyRateSettings,
	isCommissionOnlyPayTier,
	POST_JOB_PAY_TIER_OPTIONS,
	type PostJobPayTierRow,
	payTierRowShiftWage,
	resolveEffectiveShiftPayTierRows,
	shiftTierStaffingByPayTier,
} from "@agency-portal/lib/post-job-pay-tiers";
import type { PrReceiptScan } from "@agency-portal/lib/pr-demo";
import type { PrPayClass } from "@agency-portal/lib/pr-penalties";
import { shiftStartMs } from "@agency-portal/lib/pr-schedule-cancellation";
import {
	aggregateShiftSales,
	shiftSalesLogged,
} from "@agency-portal/lib/pr-shift-status";
import { receiptDateIso } from "@agency-portal/lib/receipt-scan-utils";
import type { ShiftRequest } from "@agency-portal/lib/store";

// Declared in a leaf module so `outlet-demo` can read them without importing
// this file — see `outlet-financial-defaults.ts` for why that cycle was fatal.
// Re-exported here so every existing import site keeps working unchanged.
export {
	DEFAULT_DRINK_UNITS,
	DEFAULT_PER_DRINK_RM,
	DEFAULT_PER_TABLE_RM,
	DEFAULT_TABLE_UNITS,
};

export function totalDrinkUnits(shift: {
	drinkUnits?: number;
	drinkUnitCounts?: Record<string, number>;
}): number {
	if (shift.drinkUnitCounts && Object.keys(shift.drinkUnitCounts).length > 0) {
		return Object.values(shift.drinkUnitCounts).reduce(
			(sum, qty) => sum + qty,
			0,
		);
	}
	return shift.drinkUnits ?? DEFAULT_DRINK_UNITS;
}

export function computeDrinkSales(
	shift: {
		drinkUnits?: number;
		drinkUnitCounts?: Record<string, number>;
		legacyDrinkSalesRm?: number;
		perDrinkRm?: number;
	},
	drinkMenu: OutletDrinkPrice[] = [],
): number {
	const countEntries = shift.drinkUnitCounts
		? Object.entries(shift.drinkUnitCounts).filter(([, qty]) => qty > 0)
		: [];
	if (countEntries.length > 0 && drinkMenu.length > 0) {
		let total = shift.legacyDrinkSalesRm ?? 0;
		for (const [id, qty] of countEntries) {
			const item = drinkMenu.find((d) => d.id === id);
			total +=
				qty * (item?.priceRm ?? shift.perDrinkRm ?? DEFAULT_PER_DRINK_RM);
		}
		return total;
	}
	if (shift.legacyDrinkSalesRm != null) {
		return shift.legacyDrinkSalesRm;
	}
	const drinkUnits = shift.drinkUnits ?? DEFAULT_DRINK_UNITS;
	const perDrinkRm = shift.perDrinkRm ?? DEFAULT_PER_DRINK_RM;
	return drinkUnits * perDrinkRm;
}

/** Live floor sales = drink sales only */
export function computeShiftLiveSales(
	shift: {
		drinkUnits?: number;
		drinkUnitCounts?: Record<string, number>;
		legacyDrinkSalesRm?: number;
		perDrinkRm?: number;
	},
	drinkMenu: OutletDrinkPrice[] = [],
): number {
	const drinkSales = computeDrinkSales(shift, drinkMenu);
	return Math.round(drinkSales * 100) / 100;
}

export type OutletShiftFloorActivity = {
	outletName: string;
	rosterSlots?: AgencyRosterSlot[];
	receiptScans?: PrReceiptScan[];
	prIds?: string[];
};

/** True once the scheduled shift start time has passed (sealed shifts always count as started). */
export function outletShiftClockStarted(
	shift: Pick<ShiftRequest, "date" | "dateIso" | "shift" | "status">,
	now = new Date(),
): boolean {
	if (shift.status === "sealed") return true;
	const dateIso = resolveOutletShiftDateIso(shift.date, shift.dateIso);
	const start = shiftStartTimeFromLabel(shift.shift);
	if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
	return now.getTime() >= shiftStartMs(dateIso, start);
}

/** Floor sales and live earnings count after shift start, check-in, or a logged receipt. */
export function outletShiftFloorSalesStarted(
	shift: Pick<ShiftRequest, "date" | "dateIso" | "shift" | "status">,
	now = new Date(),
	activity?: OutletShiftFloorActivity,
): boolean {
	if (shift.status === "sealed") return true;
	if (outletShiftClockStarted(shift, now)) return true;
	if (!activity) return false;

	const shiftDateIso = resolveOutletShiftDateIso(shift.date, shift.dateIso);
	const prIds = new Set(activity.prIds ?? []);

	if (
		activity.receiptScans?.some(
			(scan) =>
				!isPayrollCommissionReceiptScan(scan) &&
				(prIds.size === 0 || (scan.prId != null && prIds.has(scan.prId))) &&
				outletMatches(scan.outlet, activity.outletName) &&
				receiptDateIso(scan) === shiftDateIso,
		)
	) {
		return true;
	}

	if (activity.rosterSlots?.some((slot) => Boolean(slot.checkedInAt)))
		return true;

	return false;
}

/** PV payroll sync lines log commission RM — not gross floor sales. */
export function isPayrollCommissionReceiptScan(scan: PrReceiptScan): boolean {
	return Boolean(scan.pvId && scan.pvLineDesc);
}

export type OutletShiftLiveSalesContext = {
	outletName: string;
	drinkMenu?: OutletDrinkPrice[];
	rosterSlots: AgencyRosterSlot[];
	receiptScans?: PrReceiptScan[];
	/** Included in total when matching the tonight summary grand total. */
	specialServiceRm?: number;
	now?: Date;
};

export function outletShiftLiveSalesTotal(
	shift: ShiftRequest,
	ctx: OutletShiftLiveSalesContext,
): number {
	if (
		!outletShiftFloorSalesStarted(shift, ctx.now, {
			outletName: ctx.outletName,
			rosterSlots: ctx.rosterSlots,
			receiptScans: ctx.receiptScans,
			prIds: shift.prs ?? [],
		})
	) {
		return 0;
	}
	const floor = outletTonightFloorTotals({
		shift,
		outletName: ctx.outletName,
		drinkMenu: ctx.drinkMenu ?? [],
		rosterSlots: ctx.rosterSlots,
		prIds: shift.prs ?? [],
		receiptScans: ctx.receiptScans,
	});
	return roundRm(floor.totalSalesRm + (ctx.specialServiceRm ?? 0));
}

export function outletShiftDisplayLiveSales(
	shift: ShiftRequest,
	ctx?: OutletShiftLiveSalesContext,
	now = new Date(),
): number {
	if (ctx)
		return outletShiftLiveSalesTotal(shift, { ...ctx, now: ctx.now ?? now });
	if (!outletShiftFloorSalesStarted(shift, now)) return 0;
	return shift.liveSales ?? 0;
}

export function outletPrLiveFloorSales(opts: {
	prId: string;
	outletName: string;
	shift: Pick<
		ShiftRequest,
		"date" | "dateIso" | "shift" | "status" | "perDrinkRm" | "eventDrinkMenu"
	>;
	slot?: AgencyRosterSlot;
	drinkMenu: OutletDrinkPrice[];
	receiptScans?: PrReceiptScan[];
	now?: Date;
}): OutletPrLiveSales {
	const empty = { salesRm: 0, drinkSalesRm: 0, drinkUnits: 0, tipRm: 0 };
	if (
		!outletShiftFloorSalesStarted(opts.shift, opts.now, {
			outletName: opts.outletName,
			rosterSlots: opts.slot ? [opts.slot] : undefined,
			receiptScans: opts.receiptScans,
			prIds: [opts.prId],
		})
	) {
		return empty;
	}
	const shiftDateIso = resolveOutletShiftDateIso(
		opts.shift.date,
		opts.shift.dateIso,
	);
	const scans = (opts.receiptScans ?? []).filter(
		(scan) =>
			scan.prId === opts.prId &&
			outletMatches(scan.outlet, opts.outletName) &&
			receiptDateIso(scan) === shiftDateIso,
	);
	const grossScans = scans.filter(
		(scan) => !isPayrollCommissionReceiptScan(scan),
	);

	if (grossScans.length > 0) {
		const agg = aggregateShiftSales(grossScans);
		const drinkSalesRm = grossScans.reduce(
			(sum, scan) =>
				sum +
				scan.items
					.filter((item) => item.category === "drinks")
					.reduce((line, item) => line + item.amount, 0),
			0,
		);
		const tipRm = agg.tipRm;
		const salesRm = shiftSalesLogged(grossScans);
		return {
			salesRm,
			drinkSalesRm: drinkSalesRm > 0 ? drinkSalesRm : salesRm,
			drinkUnits: agg.drinkUnits,
			tipRm,
		};
	}

	const menu = effectiveShiftDrinkMenu(opts.shift, opts.drinkMenu);
	const perDrink = opts.shift.perDrinkRm ?? typicalDrinkPrice(menu);
	const drinkUnits = opts.slot?.floorDrinks ?? 0;
	const drinkSalesRm = Math.round(drinkUnits * perDrink * 100) / 100;
	const tipRm = opts.slot?.floorTips ?? 0;
	return {
		salesRm: Math.round((drinkSalesRm + tipRm) * 100) / 100,
		drinkSalesRm,
		drinkUnits,
		tipRm,
	};
}

export type OutletPrLiveSales = {
	salesRm: number;
	drinkSalesRm: number;
	drinkUnits: number;
	tipRm: number;
};

/** Per-roster-slot floor sales — prefers PR receipt scans, falls back to roster counters. */
export function rosterSlotLiveFloorSales(opts: {
	slot: AgencyRosterSlot;
	outletShifts: Array<{
		outletName: string;
		shift: string;
		date?: string;
		dateIso?: string;
		status?: string;
		perDrinkRm?: number;
		eventDrinkMenu?: OutletDrinkPrice[];
	}>;
	drinkMenu: OutletDrinkPrice[];
	receiptScans?: PrReceiptScan[];
}): OutletPrLiveSales {
	const shift = findOutletShiftForRosterSlot(opts.outletShifts, opts.slot);
	if (!shift) {
		return { salesRm: 0, drinkSalesRm: 0, drinkUnits: 0, tipRm: 0 };
	}
	return outletPrLiveFloorSales({
		prId: opts.slot.prId,
		outletName: opts.slot.outlet,
		shift: {
			date: shift.date ?? "Tonight",
			dateIso: shift.dateIso,
			shift: shift.shift,
			status: (shift.status ?? "confirmed") as ShiftRequest["status"],
			perDrinkRm: shift.perDrinkRm,
			eventDrinkMenu: shift.eventDrinkMenu,
		},
		slot: opts.slot,
		drinkMenu: opts.drinkMenu,
		receiptScans: opts.receiptScans,
	});
}

export function rosterSlotHasReceiptFloorSales(
	floor: OutletPrLiveSales,
): boolean {
	return floor.drinkSalesRm > 0 || floor.tipRm > 0;
}

/** Est. payout from receipt-linked floor sales (gross drink RM + tips). */
export function rosterSlotPayoutFromFloorSales(
	slot: AgencyRosterSlot,
	floor: OutletPrLiveSales,
	opts: {
		trainingLevel?: string;
		rules?: OutletCommissionRule[];
		shiftTierRates?: Record<OutletPrTier, OutletTierRateSettings>;
	} = {},
): number {
	const rules = opts.rules ?? OUTLET_COMMISSION_RULES;
	const hours = shiftHoursFromLabel(slot.shift);
	return calcShiftPayout(
		{
			outlet: slot.outlet,
			hoursWorked: hours,
			drinks: floor.drinkUnits,
			drinkSales: floor.drinkSalesRm,
			tips: floor.tipRm,
			prTier: opts.trainingLevel,
			shiftTierRates: opts.shiftTierRates,
		},
		rules,
	).total;
}

/** Same total as the Est. payout breakdown sheet — HH/normal drink split + tip commission. */
export function rosterSlotBreakdownTotal(
	slot: AgencyRosterSlot,
	ctx: Pick<
		RosterShiftEarningsContext,
		| "outletShifts"
		| "drinkMenu"
		| "receiptScans"
		| "happyHourStart"
		| "happyHourEnd"
		| "workspaceTierRates"
		| "agencyPRs"
		| "commissionOnlyRates"
	>,
): number | null {
	const outletShift = findOutletShiftForRosterSlot(ctx.outletShifts, slot);
	if (!outletShift) return null;

	const tierRates = resolveShiftTierRates(
		outletShift as {
			tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
			payPerHour: number;
		},
		{ tierRates: ctx.workspaceTierRates },
	);
	const prProfile = ctx.agencyPRs.find((pr) => pr.id === slot.prId);
	const trainingLevel = prProfile?.trainingLevel;

	const shiftForBreakdown: Pick<
		ShiftRequest,
		"date" | "dateIso" | "shift" | "status" | "perDrinkRm" | "eventDrinkMenu"
	> = {
		date: outletShift.date ?? "Tonight",
		dateIso: outletShift.dateIso,
		shift: outletShift.shift,
		status: (outletShift.status ?? "confirmed") as ShiftRequest["status"],
		perDrinkRm: outletShift.perDrinkRm,
		eventDrinkMenu: outletShift.eventDrinkMenu,
	};

	return outletPrLiveEarningsBreakdown({
		prId: slot.prId,
		prName: slot.prName,
		trainingLevel,
		payClass: prProfile?.payClass,
		outletName: slot.outlet,
		shift: shiftForBreakdown as ShiftRequest,
		slot,
		drinkMenu: ctx.drinkMenu,
		tierRates,
		commissionOnlyRates: ctx.commissionOnlyRates,
		happyHourStart: ctx.happyHourStart,
		happyHourEnd: ctx.happyHourEnd,
		receiptScans: ctx.receiptScans,
	}).totalEarnRm;
}

export type OutletTonightFloorTotals = {
	totalSalesRm: number;
	totalDrinksRm: number;
	drinkUnits: number;
	totalTipsRm: number;
};

/** Aggregate floor sales across PRs booked on tonight's shift. */
export function outletTonightFloorTotals(opts: {
	shift: ShiftRequest;
	outletName: string;
	drinkMenu: OutletDrinkPrice[];
	rosterSlots: AgencyRosterSlot[];
	prIds: string[];
	receiptScans?: PrReceiptScan[];
}): OutletTonightFloorTotals {
	const rosterByPr = new Map(opts.rosterSlots.map((s) => [s.prId, s]));
	let totalSalesRm = 0;
	let totalDrinksRm = 0;
	let drinkUnits = 0;
	let totalTipsRm = 0;
	for (const prId of opts.prIds) {
		const sales = outletPrLiveFloorSales({
			prId,
			outletName: opts.outletName,
			shift: opts.shift,
			slot: rosterByPr.get(prId),
			drinkMenu: opts.drinkMenu,
			receiptScans: opts.receiptScans,
		});
		totalSalesRm += sales.salesRm;
		totalDrinksRm += sales.drinkSalesRm;
		drinkUnits += sales.drinkUnits;
		totalTipsRm += sales.tipRm;
	}
	return {
		totalSalesRm: roundRm(totalSalesRm),
		totalDrinksRm: roundRm(totalDrinksRm),
		drinkUnits,
		totalTipsRm: roundRm(totalTipsRm),
	};
}

export type OutletPrLiveEarningsBreakdown = {
	prName: string;
	prId: string;
	dailyWagesRm: number;
	hhDrinkSalesRm: number;
	hhDrinkPct: number;
	hhCommissionRm: number;
	normalDrinkSalesRm: number;
	normalDrinkPct: number;
	normalCommissionRm: number;
	tipSalesRm: number;
	tipPct: number;
	tipCommissionRm: number;
	otHours: number;
	otRmPerHour: number;
	otPayRm: number;
	totalEarnRm: number;
};

/** Live earnings row for outlet floor — wages, HH/normal drink commission, tips & OT. */
export function outletPrLiveEarningsBreakdown(opts: {
	prId: string;
	prName: string;
	trainingLevel?: string;
	payClass?: PrPayClass;
	outletName: string;
	shift: ShiftRequest;
	slot?: AgencyRosterSlot;
	drinkMenu: OutletDrinkPrice[];
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	commissionOnlyRates?: CommissionOnlyRateSettings;
	happyHourStart: string;
	happyHourEnd: string;
	receiptScans?: PrReceiptScan[];
}): OutletPrLiveEarningsBreakdown {
	const tier = resolveOutletPrTier(opts.trainingLevel);
	const tierRate = opts.tierRates[tier] ?? opts.tierRates[OUTLET_BASE_TIER];
	// Pay class is orthogonal to training tier: the slot's recorded payTierId wins,
	// else the PR's pay class, else their training tier. Commission-only earns RM 0
	// wage + commission-only drink/tip rates; OT (wage-based) never applies to it.
	const payTierId = effectiveShiftPayTierId(opts.slot?.payTierId, {
		payClass: opts.payClass,
		trainingLevel: opts.trainingLevel,
	});
	const commissionOnly = isCommissionOnlyPayTier(payTierId);
	const effRate = resolveShiftRateForPayTier(
		payTierId,
		opts.tierRates,
		opts.commissionOnlyRates ?? defaultCommissionOnlyRateSettings(),
	);
	const floor = outletPrLiveFloorSales({
		prId: opts.prId,
		outletName: opts.outletName,
		shift: opts.shift,
		slot: opts.slot,
		drinkMenu: opts.drinkMenu,
		receiptScans: opts.receiptScans,
	});

	const shiftHours = shiftHoursFromLabel(opts.shift.shift);
	const hhHours = happyHourWindowHours(opts.happyHourStart, opts.happyHourEnd);
	const hhRatio = shiftHours > 0 ? Math.min(1, hhHours / shiftHours) : 0.25;
	const hhDrinkSalesRm = roundRm(floor.drinkSalesRm * hhRatio);
	const normalDrinkSalesRm = roundRm(floor.drinkSalesRm - hhDrinkSalesRm);

	const hhDrinkPct = effRate.happyHourDrinkPct;
	const normalDrinkPct = effRate.drinkPct;
	const tipPct = effRate.tipPct;

	const hhCommissionRm = roundRm((hhDrinkSalesRm * hhDrinkPct) / 100);
	const normalCommissionRm = roundRm(
		(normalDrinkSalesRm * normalDrinkPct) / 100,
	);
	const tipCommissionRm = roundRm((floor.tipRm * tipPct) / 100);

	const dailyWagesRm = effRate.wagePerHour;
	const otHours = commissionOnly
		? 0
		: Math.max(0, shiftHours - tierRate.otAfterHours);
	const otRmPerHour = commissionOnly ? 0 : roundRm(tierOtRmPerHour(tierRate));
	const otPayRm = roundRm(otHours * otRmPerHour);

	const totalEarnRm = roundRm(
		dailyWagesRm +
			hhCommissionRm +
			normalCommissionRm +
			tipCommissionRm +
			otPayRm,
	);

	return {
		prName: opts.prName,
		prId: opts.prId,
		dailyWagesRm,
		hhDrinkSalesRm,
		hhDrinkPct,
		hhCommissionRm,
		normalDrinkSalesRm,
		normalDrinkPct,
		normalCommissionRm,
		tipSalesRm: floor.tipRm,
		tipPct,
		tipCommissionRm,
		otHours,
		otRmPerHour,
		otPayRm,
		totalEarnRm,
	};
}

/** Per-PR live earnings rows for tonight's shift — same source as Live Sales sheets. */
export function outletTonightLiveEarningsRows(opts: {
	shift: ShiftRequest;
	outletName: string;
	drinkMenu: OutletDrinkPrice[];
	rosterSlots: AgencyRosterSlot[];
	prIds: string[];
	prNameById: Record<string, string>;
	trainingLevelById: Record<string, string | undefined>;
	payClassById?: Record<string, PrPayClass | undefined>;
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	commissionOnlyRates?: CommissionOnlyRateSettings;
	happyHourStart: string;
	happyHourEnd: string;
	receiptScans?: PrReceiptScan[];
}): OutletPrLiveEarningsBreakdown[] {
	const rosterByPr = new Map(opts.rosterSlots.map((s) => [s.prId, s]));
	return opts.prIds.flatMap((prId) => {
		const prName = opts.prNameById[prId];
		if (!prName) return [];
		return [
			outletPrLiveEarningsBreakdown({
				prId,
				prName,
				trainingLevel: opts.trainingLevelById[prId],
				payClass: opts.payClassById?.[prId],
				outletName: opts.outletName,
				shift: opts.shift,
				slot: rosterByPr.get(prId),
				drinkMenu: opts.drinkMenu,
				tierRates: opts.tierRates,
				commissionOnlyRates: opts.commissionOnlyRates,
				happyHourStart: opts.happyHourStart,
				happyHourEnd: opts.happyHourEnd,
				receiptScans: opts.receiptScans,
			}),
		];
	});
}

export function rosterSlotsForShiftBreakdown(
	anchor: AgencyRosterSlot,
	roster: AgencyRosterSlot[],
): AgencyRosterSlot[] {
	return roster
		.filter(
			(slot) =>
				slot.dateIso === anchor.dateIso &&
				outletMatches(slot.outlet, anchor.outlet) &&
				slot.shift === anchor.shift &&
				slot.status !== "unavailable",
		)
		.sort((a, b) =>
			a.prName.localeCompare(b.prName, undefined, { sensitivity: "base" }),
		);
}

export type RosterShiftEarningsContext = {
	rosterScope: AgencyRosterSlot[];
	agencyPRs: {
		id: string;
		name: string;
		trainingLevel?: string;
		payClass?: PrPayClass;
	}[];
	outletShifts: Array<
		Pick<
			ShiftRequest,
			| "outletName"
			| "shift"
			| "date"
			| "dateIso"
			| "status"
			| "perDrinkRm"
			| "eventDrinkMenu"
			| "tierRates"
			| "payPerHour"
		>
	>;
	drinkMenu: OutletDrinkPrice[];
	receiptScans?: PrReceiptScan[];
	happyHourStart: string;
	happyHourEnd: string;
	workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>;
	commissionOnlyRates?: CommissionOnlyRateSettings;
};

export function rosterShiftEarningsRows(
	anchor: AgencyRosterSlot,
	ctx: RosterShiftEarningsContext,
): OutletPrLiveEarningsBreakdown[] {
	const slots = rosterSlotsForShiftBreakdown(anchor, ctx.rosterScope);
	const outletShift = findOutletShiftForRosterSlot(ctx.outletShifts, anchor);
	if (!outletShift || slots.length === 0) return [];

	const tierRates = resolveShiftTierRates(
		outletShift as {
			tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
			payPerHour: number;
		},
		{ tierRates: ctx.workspaceTierRates },
	);
	const prById = new Map(ctx.agencyPRs.map((pr) => [pr.id, pr]));

	const shiftForBreakdown: Pick<
		ShiftRequest,
		"date" | "dateIso" | "shift" | "status" | "perDrinkRm" | "eventDrinkMenu"
	> = {
		date: outletShift.date ?? "Tonight",
		dateIso: outletShift.dateIso,
		shift: outletShift.shift,
		status: (outletShift.status ?? "confirmed") as ShiftRequest["status"],
		perDrinkRm: outletShift.perDrinkRm,
		eventDrinkMenu: outletShift.eventDrinkMenu,
	};

	return slots.map((slot) =>
		outletPrLiveEarningsBreakdown({
			prId: slot.prId,
			prName: slot.prName,
			trainingLevel: prById.get(slot.prId)?.trainingLevel,
			payClass: prById.get(slot.prId)?.payClass,
			outletName: slot.outlet,
			shift: shiftForBreakdown as ShiftRequest,
			slot,
			drinkMenu: ctx.drinkMenu,
			tierRates,
			commissionOnlyRates: ctx.commissionOnlyRates,
			happyHourStart: ctx.happyHourStart,
			happyHourEnd: ctx.happyHourEnd,
			receiptScans: ctx.receiptScans,
		}),
	);
}

export function floorTipsForOutlet(
	outletName: string,
	roster: AgencyRosterSlot[] = [],
): number {
	return floorTipsForOutletFromRoster(roster, outletName);
}

export function roundRm(n: number): number {
	return Math.round(n * 100) / 100;
}

export interface OutletPnlSynced extends OutletPnlRow {
	/** Tonight floor gross (before week rollup) */
	liveFloorGross: number;
	prWages: number;
	prCommission: number;
	/** True when an outlet shift drives this row */
	syncedFromOutlet: boolean;
}

export function withShiftFinancialDefaults(
	shift: ShiftRequest,
	workspaceDrinkMenu: OutletDrinkPrice[] = [],
): ShiftRequest {
	const drinkMenu = effectiveShiftDrinkMenu(shift, workspaceDrinkMenu);
	const perDrinkRm = shift.perDrinkRm ?? averageDrinkPrice(drinkMenu);
	const drinkUnits = totalDrinkUnits(shift);
	const computed =
		drinkUnits > 0
			? computeShiftLiveSales({ ...shift, drinkUnits }, drinkMenu)
			: 0;
	const live = outletShiftFloorSalesStarted(shift) ? computed : 0;
	const anchorLiveSales = shift.anchorLiveSales ?? live;
	return {
		...shift,
		perDrinkRm,
		drinkUnits,
		tableUnits: 0,
		anchorLiveSales,
		liveSales: live,
	};
}

/** Roll outlet floor edits into agency PNL (gross, PR payout, agency net, outlet net) */
export function buildSyncedOutletPnlRow(
	seedRow: OutletPnlRow,
	shift: ShiftRequest,
	roster: AgencyRosterSlot[] = [],
	drinkMenu: OutletDrinkPrice[] = [],
	commissionRules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
): OutletPnlSynced {
	const rule = getOutletRule(seedRow.outlet, commissionRules);
	const shiftMenu = effectiveShiftDrinkMenu(shift, drinkMenu);
	const s = withShiftFinancialDefaults(shift, drinkMenu);
	const drinkUnits = totalDrinkUnits(s);
	const liveFloorGross = computeShiftLiveSales(s, shiftMenu);
	const anchorLive = s.anchorLiveSales ?? liveFloorGross;
	const grossDelta = liveFloorGross - anchorLive;
	const grossRevenue =
		Math.round((seedRow.grossRevenue + grossDelta) * 100) / 100;

	const drinkSales = computeDrinkSales(s, shiftMenu);
	const tips = floorTipsForOutlet(s.outletName, roster);
	const payout = calcShiftPayout(
		{
			outlet: seedRow.outlet,
			hoursWorked: 6,
			drinks: drinkUnits,
			drinkSales,
			tips,
			shiftTierRates: s.tierRates,
		},
		commissionRules,
	);
	const prCommission =
		Math.round((payout.drinkCommission + payout.tipCommission) * 100) / 100;
	const prWages = s.estimatedCost;
	const anchorCommission = calcAnchorCommission(
		seedRow.outlet,
		anchorLive,
		s,
		roster,
		shiftMenu,
		commissionRules,
	);
	const prPayout = Math.round((prWages + prCommission) * 100) / 100;
	const anchorPrPayout = Math.round((prWages + anchorCommission) * 100) / 100;
	const prPayoutDelta = prPayout - anchorPrPayout;

	const platformFee =
		Math.round(grossRevenue * (rule.platformPct / 100) * 100) / 100;
	const agencyShareOnGross =
		seedRow.grossRevenue > 0 ? seedRow.agencyNet / seedRow.grossRevenue : 0.28;
	const agencyNet =
		Math.round(
			(seedRow.agencyNet +
				grossDelta * agencyShareOnGross +
				prPayoutDelta * 0.15) *
				100,
		) / 100;
	const outletNet =
		Math.round((grossRevenue - prPayout - platformFee - agencyNet) * 100) / 100;

	return {
		...seedRow,
		grossRevenue,
		prPayout,
		agencyNet,
		outletNet,
		platformFee,
		liveFloorGross,
		prWages,
		prCommission,
		syncedFromOutlet: true,
	};
}

function calcAnchorCommission(
	outlet: string,
	anchorLive: number,
	shift: ShiftRequest,
	roster: AgencyRosterSlot[] = [],
	drinkMenu: OutletDrinkPrice[] = [],
	commissionRules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
) {
	const perDrink = shift.perDrinkRm ?? DEFAULT_PER_DRINK_RM;
	const drinkUnits = perDrink > 0 ? anchorLive / perDrink : 0;
	const payout = calcShiftPayout(
		{
			outlet,
			hoursWorked: 6,
			drinks: drinkUnits,
			drinkSales: computeDrinkSales({ ...shift, drinkUnits }, drinkMenu),
			tips: floorTipsForOutlet(shift.outletName, roster),
			shiftTierRates: shift.tierRates,
		},
		commissionRules,
	);
	return payout.drinkCommission + payout.tipCommission;
}

export type LaborCostReportLine = {
	id: string;
	label: string;
	depth: 0 | 1;
	actualRm: number;
	budgetRm: number;
};

export function buildOutletLaborCostReport(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs?: string[];
		payTierRows?: PostJobPayTierRow[];
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	agencyPRs: { id: string; trainingLevel?: string }[],
): {
	lines: LaborCostReportLine[];
	totalActualRm: number;
	totalBudgetRm: number;
} {
	const prTierById = Object.fromEntries(
		agencyPRs.map((p) => [p.id, p.trainingLevel]),
	);
	const activePrIds = outletShiftActivePrIds(shift);
	const releasedIds = [...new Set(shift.releasedEarlyPrIds ?? [])];
	const bookedIncludingReleased = [...activePrIds, ...releasedIds];
	const totalBudgetRm = outletShiftTargetLaborCost(
		shift,
		tierRates,
		prTierById,
	);
	const totalActualRm = outletShiftActualLaborCostForShift(
		shift,
		tierRates,
		prTierById,
	);

	const staffing = shiftTierStaffingByPayTier({
		payTierRows: shift.payTierRows,
		quantity: shift.quantity,
		demandCut: shift.demandCut,
		// Labor budget keeps early releases in planned demand.
		releasedEarlyPrIds: undefined,
		tierRates,
		bookedPrIds: bookedIncludingReleased,
		agencyPRs,
	});
	const activeStaffing = shiftTierStaffingByPayTier({
		payTierRows: shift.payTierRows,
		quantity: shift.quantity,
		demandCut: shift.demandCut,
		releasedEarlyPrIds: undefined,
		tierRates,
		bookedPrIds: activePrIds,
		agencyPRs,
	});
	const demandRows = resolveEffectiveShiftPayTierRows({
		payTierRows: shift.payTierRows,
		quantity: shift.quantity,
		demandCut: shift.demandCut,
		releasedEarlyPrIds: undefined,
		tierRates,
		bookedPrIds: bookedIncludingReleased,
		agencyPRs,
		prTierById,
	});

	const tierLines: LaborCostReportLine[] = [];
	for (const option of POST_JOB_PAY_TIER_OPTIONS) {
		const stats = staffing[option.id];
		const activeStats = activeStaffing[option.id];
		if (
			!stats ||
			(stats.demand === 0 &&
				(activeStats?.supplied ?? 0) === 0 &&
				!releasedIds.length)
		) {
			continue;
		}
		if (!stats) continue;
		const demandRow = demandRows.find((row) => row.payTierId === option.id);
		const wage = demandRow
			? payTierRowShiftWage(demandRow, tierRates)
			: option.outletTier
				? (tierRates[option.outletTier]?.wagePerHour ?? 0)
				: 0;
		tierLines.push({
			id: option.id,
			label: option.label,
			depth: 1,
			budgetRm: wage * stats.demand,
			// Active PRs at full wage; early-release pro-rata is included in the total row.
			actualRm: wage * (activeStats?.supplied ?? 0),
		});
	}

	return {
		lines: [
			{
				id: "labor-total",
				label: "Labor cost",
				depth: 0,
				actualRm: totalActualRm,
				budgetRm: totalBudgetRm,
			},
			...tierLines,
		],
		totalActualRm,
		totalBudgetRm,
	};
}

export function recomputeAllOutletPnl(
	shifts: ShiftRequest[],
	seedRows: OutletPnlRow[] = SEED_OUTLET_PNL,
	roster: AgencyRosterSlot[] = [],
	drinkMenu: OutletDrinkPrice[] = [],
	commissionRules: OutletCommissionRule[] = OUTLET_COMMISSION_RULES,
): OutletPnlSynced[] {
	return seedRows.map((row) => {
		const active = shifts.find(
			(s) =>
				s.outletName === row.outlet &&
				(s.date === "Tonight" ||
					s.status === "confirmed" ||
					s.status === "open"),
		);
		if (!active) {
			return {
				...row,
				liveFloorGross: 0,
				prWages: 0,
				prCommission: 0,
				syncedFromOutlet: false,
			};
		}
		return buildSyncedOutletPnlRow(
			row,
			active,
			roster,
			drinkMenu,
			commissionRules,
		);
	});
}
