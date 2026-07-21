/** Shared shift transaction log — agency & outlet read the same records */

import { resolveRosterPrName } from "@agency-portal/lib/agency-demo";
import {
	deriveHistoryDrinkSalesRm,
	sealedAmountsToHistoryFields,
	sealShiftHistoryAmounts,
	tipCommissionIgnoresWorkspacePct,
} from "@agency-portal/lib/shift-history-amounts";
import {
	mergeShiftHistory,
	prepareShiftHistoryForDisplay,
	type ShiftHistoryRow,
} from "@agency-portal/lib/shift-history-utils";
import { buildAllVelvetSeedShiftHistory } from "@agency-portal/lib/velvet-week-demo";

export type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
export {
	compareShiftHistoryDesc,
	dedupeShiftHistorySlots,
	filterShiftHistoryThroughToday,
	isCheckoutShiftHistoryRow,
	isDateInCurrentPayrollWeek,
	isPayrollSyncedShiftHistoryRow,
	mergeShiftHistory,
	prepareShiftHistoryForDisplay,
	shiftHistorySlotKey,
	sortShiftHistoryDesc,
} from "@agency-portal/lib/shift-history-utils";

/** Demo outlet venue — outlet history shows rows for this venue only */
export const OUTLET_VENUE_NAME = "Velvet 23";

function seedOtherRow(input: {
	id: string;
	prName: string;
	prId: string;
	outlet: string;
	agencyName: string;
	dateDisplay: string;
	dateIso: string;
	totalDrinks: number;
	totalTips: number;
	totalTables: number;
	durationHours: number;
}): ShiftHistoryRow {
	const sealed = sealShiftHistoryAmounts({
		outlet: input.outlet,
		drinkUnits: input.totalDrinks,
		tipSalesRm: input.totalTips,
		tableUnits: input.totalTables,
		hoursWorked: input.durationHours,
	});
	return {
		id: input.id,
		prName: input.prName,
		prId: input.prId,
		outlet: input.outlet,
		agencyName: input.agencyName,
		dateDisplay: input.dateDisplay,
		dateIso: input.dateIso,
		...sealedAmountsToHistoryFields(sealed),
		durationHours: input.durationHours,
	};
}

const SEED_SHIFT_HISTORY_OTHER: ShiftHistoryRow[] = [
	seedOtherRow({
		id: "h5",
		prName: "Victoria",
		prId: "pr-comcard-victoria",
		outlet: "Mermate",
		agencyName: "Atlas Agency",
		dateDisplay: "7 Jun 2026",
		dateIso: "2026-06-07",
		totalDrinks: 55,
		totalTips: 32,
		totalTables: 2,
		durationHours: 5,
	}),
	seedOtherRow({
		id: "h6",
		prName: "Sarah",
		prId: "pr-comcard-sarah",
		outlet: "Bear Lounge",
		agencyName: "Atlas Agency",
		dateDisplay: "6 Jun 2026",
		dateIso: "2026-06-06",
		totalDrinks: 78,
		totalTips: 41,
		totalTables: 3,
		durationHours: 6,
	}),
	seedOtherRow({
		id: "h7",
		prName: "Vicky",
		prId: "p1",
		outlet: "Mermate",
		agencyName: "Atlas Agency",
		dateDisplay: "04 May 2026",
		dateIso: "2026-05-04",
		totalDrinks: 24,
		totalTips: 40,
		totalTables: 1,
		durationHours: 6,
	}),
	seedOtherRow({
		id: "h8",
		prName: "Vicky",
		prId: "p1",
		outlet: "Mermate",
		agencyName: "Atlas Agency",
		dateDisplay: "05 May 2026",
		dateIso: "2026-05-05",
		totalDrinks: 22,
		totalTips: 50,
		totalTables: 1,
		durationHours: 6,
	}),
	seedOtherRow({
		id: "h9",
		prName: "Vicky",
		prId: "p1",
		outlet: "Bear Lounge",
		agencyName: "Atlas Agency",
		dateDisplay: "06 May 2026",
		dateIso: "2026-05-06",
		totalDrinks: 17,
		totalTips: 50,
		totalTables: 1,
		durationHours: 6,
	}),
	// --- Delta Agency's own sealed shifts (peer-agency demo) ---
	// Tagged "Delta Agency" so they only surface in Delta's History, never Atlas's.
	// Dated in early June (before the payroll demo weeks) so they survive the PV sync.
	seedOtherRow({
		id: "hd1",
		prName: "Sofia",
		prId: "delta-p1",
		outlet: "Velvet 23",
		agencyName: "Delta Agency",
		dateDisplay: "05 Jun 2026",
		dateIso: "2026-06-05",
		totalDrinks: 38,
		totalTips: 44,
		totalTables: 2,
		durationHours: 6,
	}),
	seedOtherRow({
		id: "hd2",
		prName: "Rina",
		prId: "delta-p2",
		outlet: "Bear Lounge",
		agencyName: "Delta Agency",
		dateDisplay: "06 Jun 2026",
		dateIso: "2026-06-06",
		totalDrinks: 51,
		totalTips: 38,
		totalTables: 3,
		durationHours: 6,
	}),
	seedOtherRow({
		id: "hd3",
		prName: "Mei",
		prId: "delta-p3",
		outlet: "Mermate",
		agencyName: "Delta Agency",
		dateDisplay: "07 Jun 2026",
		dateIso: "2026-06-07",
		totalDrinks: 29,
		totalTips: 33,
		totalTables: 1,
		durationHours: 5,
	}),
	seedOtherRow({
		id: "hd4",
		prName: "Sofia",
		prId: "delta-p1",
		outlet: "Bear Lounge",
		agencyName: "Delta Agency",
		dateDisplay: "08 Jun 2026",
		dateIso: "2026-06-08",
		totalDrinks: 42,
		totalTips: 47,
		totalTables: 2,
		durationHours: 6,
	}),
];

export const SEED_SHIFT_HISTORY: ShiftHistoryRow[] =
	prepareShiftHistoryForDisplay(
		mergeShiftHistory(
			buildAllVelvetSeedShiftHistory(),
			SEED_SHIFT_HISTORY_OTHER,
		),
	);

const DEMO_SEED_HISTORY_ID = /^(vh-|hd\d+$|h\d+$)/;

/**
 * Backfill drinkSalesRm and reseal demo seed payouts with Workspace rates
 * so persisted localStorage history matches Total Received / Total Payout.
 */
export function migrateShiftHistoryFinancials(
	rows: ShiftHistoryRow[],
): ShiftHistoryRow[] {
	return (rows ?? []).map((row) => {
		const isDemoSeed = DEMO_SEED_HISTORY_ID.test(row.id);
		// Don't re-% payroll PV line items (those amts are already commissions).
		const needsTipReseal =
			tipCommissionIgnoresWorkspacePct(row) && !row.id.startsWith("ap-shift-");
		if (isDemoSeed || needsTipReseal) {
			const sealed = sealShiftHistoryAmounts({
				outlet: row.outlet,
				drinkUnits: row.totalDrinks,
				tipSalesRm: row.totalTips,
				tableUnits: 0,
				hoursWorked: row.durationHours || 6,
				drinkSalesRm: row.drinkSalesRm,
			});
			return {
				...row,
				...sealedAmountsToHistoryFields(sealed),
				totalTables: row.totalTables ?? 0,
			};
		}
		if (
			typeof row.drinkSalesRm === "number" &&
			Number.isFinite(row.drinkSalesRm) &&
			(typeof row.wagesRm === "number" ||
				typeof row.drinkCommissionRm === "number")
		) {
			return row;
		}
		if (
			typeof row.drinkSalesRm === "number" &&
			Number.isFinite(row.drinkSalesRm)
		) {
			const sealed = sealShiftHistoryAmounts({
				outlet: row.outlet,
				drinkUnits: row.totalDrinks,
				tipSalesRm: row.totalTips,
				tableUnits: row.totalTables ?? 0,
				hoursWorked: row.durationHours || 6,
				drinkSalesRm: row.drinkSalesRm,
			});
			return {
				...row,
				...sealedAmountsToHistoryFields(sealed),
			};
		}
		return {
			...row,
			drinkSalesRm: deriveHistoryDrinkSalesRm(row.totalDrinks),
		};
	});
}

/** Canonical PR labels after localStorage hydrate (Luna → Vicky on p1; seed name wins). */
export function migrateShiftHistoryPrNames(
	rows: ShiftHistoryRow[],
	seed: ShiftHistoryRow[] = SEED_SHIFT_HISTORY,
	agencyPRs?: { id: string; name: string }[],
): ShiftHistoryRow[] {
	const seedById = Object.fromEntries(seed.map((s) => [s.id, s]));
	return rows.map((row) => {
		const seedRow = seedById[row.id];
		const seedName =
			seedRow && seedRow.prId === row.prId ? seedRow.prName : undefined;
		const prName =
			seedName ?? resolveRosterPrName(row.prId, row.prName, agencyPRs);
		return prName === row.prName ? row : { ...row, prName };
	});
}

export function shiftHistorySubline(
	row: ShiftHistoryRow,
	portal: "agency" | "outlet",
) {
	if (portal === "agency") return row.outlet;
	return `${row.agencyName} · ${row.outlet}`;
}
