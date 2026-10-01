/**
 * THE ROSTER'S DRINKS AND TIPS, FROM THE ROWS THE SERVER RECORDED.
 *
 * The agency Roster (Live) and the agency home's PR-on-duty table price their
 * Drinks and Tips columns — and the sheets that open from them — off the DEMO
 * store: receipt scans, roster counters and the store's outlet shifts. A real
 * login blanks all three, so every real booking read "—" and its sheet said
 * "No drink sales logged" while `shift_sale` held the night.
 *
 * `shift_sale` is the server's own floor-sales row per (shift, PR), recomputed
 * from the PR's APPROVED / VERIFIED receipts (shift-sale-from-receipts.ts) —
 * the row the outlet's Today, Reports and both History screens already read.
 * A roster slot is a `shift_assignment` (its id IS the assignment id), and the
 * assignment is unique on (shift, PR) exactly as `shift_sale` is, so the join
 * is on ids end to end with no name matching in it.
 *
 * Pure; in SEN while adding.
 */
import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import {
	type OutletPrLiveSales,
	type RecordedFloorSales,
	rosterSlotsForShiftBreakdown,
} from "@agency-portal/lib/outlet-financial-sync";
import type { ShiftAssignment } from "@/services/shift-assignment";
import type { ShiftSale } from "@/services/shift-sale";

function sen(rm: number | string | null | undefined): number {
	const n = Number(rm);
	return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Recorded floor sales per ROSTER SLOT (= assignment id).
 *
 * A slot with no `shift_sale` row is simply absent: nothing approved has been
 * recorded for it yet, which the columns render as "—".
 */
export function recordedSalesBySlotId(
	sales: Pick<
		ShiftSale,
		| "shiftId"
		| "prId"
		| "drinkUnits"
		| "drinkSalesRm"
		| "tipSalesRm"
		| "totalSalesRm"
	>[],
	assignments: Pick<ShiftAssignment, "id" | "shiftId" | "prId">[],
): Map<string, RecordedFloorSales> {
	const saleByShiftPr = new Map(
		sales.map((s) => [`${s.shiftId}|${s.prId}`, s]),
	);
	const out = new Map<string, RecordedFloorSales>();
	for (const a of assignments) {
		const sale = saleByShiftPr.get(`${a.shiftId}|${a.prId}`);
		if (!sale) continue;
		out.set(a.id, {
			salesRm: sen(sale.totalSalesRm) / 100,
			drinkSalesRm: sen(sale.drinkSalesRm) / 100,
			drinkUnits: Number(sale.drinkUnits) || 0,
			tipRm: sen(sale.tipSalesRm) / 100,
		});
	}
	return out;
}

/**
 * One slot's floor figures in the shape the roster columns read. Absent =
 * nothing recorded: zeros, which the columns print as "—". No happy-hour split:
 * the recorded row carries no per-receipt time to measure one from.
 */
export function liveSalesFromRecorded(
	recorded: RecordedFloorSales | undefined,
): OutletPrLiveSales {
	return {
		salesRm: recorded?.salesRm ?? 0,
		drinkSalesRm: recorded?.drinkSalesRm ?? 0,
		drinkUnits: recorded?.drinkUnits ?? 0,
		tipRm: recorded?.tipRm ?? 0,
		hhDrinkSalesRm: null,
	};
}

export interface RosterRecordedSalesRow {
	slotId: string;
	prId: string;
	prName: string;
	/** False when the server holds no row for this booking yet. */
	recorded: boolean;
	drinkUnits: number;
	drinkSalesRm: number;
	tipRm: number;
}

/**
 * The Drinks / Tips sheet on a real session: every PR booked on the anchor's
 * shift (the grouping every roster sheet uses), with what the server recorded
 * for each and the shift's totals — the same figures the columns show.
 */
export function rosterRecordedSalesRows(
	anchor: AgencyRosterSlot,
	rosterScope: AgencyRosterSlot[],
	recordedBySlotId: Map<string, RecordedFloorSales>,
): {
	rows: RosterRecordedSalesRow[];
	drinkUnits: number;
	drinkSalesRm: number;
	tipRm: number;
} {
	let units = 0;
	let drinkSen = 0;
	let tipSen = 0;
	const rows = rosterSlotsForShiftBreakdown(anchor, rosterScope).map(
		(slot): RosterRecordedSalesRow => {
			const recorded = recordedBySlotId.get(slot.id);
			const row = {
				slotId: slot.id,
				prId: slot.prId,
				prName: slot.prName,
				recorded: recorded !== undefined,
				drinkUnits: recorded?.drinkUnits ?? 0,
				drinkSalesRm: recorded?.drinkSalesRm ?? 0,
				tipRm: recorded?.tipRm ?? 0,
			};
			units += row.drinkUnits;
			drinkSen += sen(row.drinkSalesRm);
			tipSen += sen(row.tipRm);
			return row;
		},
	);
	return {
		rows,
		drinkUnits: units,
		drinkSalesRm: drinkSen / 100,
		tipRm: tipSen / 100,
	};
}
