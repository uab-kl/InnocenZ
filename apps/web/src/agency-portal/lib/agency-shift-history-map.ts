import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import type { ShiftAssignment } from "@/services/shift-assignment";
import type { ShiftSale } from "@/services/shift-sale";

// numeric(12,2) columns come back as strings; coerce defensively.
function num(value: string | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

// Worked hours from the check-in / check-out stamps; null when either is
// missing or the span isn't positive (the demo breakdown then falls back to a
// 6h default).
function workedHours(
	checkInAt: string | null,
	checkOutAt: string | null,
): number | null {
	if (!checkInAt || !checkOutAt) return null;
	const start = Date.parse(checkInAt);
	const end = Date.parse(checkOutAt);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	const hours = (end - start) / 3_600_000;
	return hours > 0 ? Math.round(hours * 100) / 100 : null;
}

/**
 * A completed backend shift-assignment -> the `ShiftHistoryRow` the History tabs
 * render (By PR / By outlet rollups + the shift-detail sheet).
 *
 * TWO LEDGERS, TWO SIDES. The PAYOUT side is the sealed `payAmount` on the
 * assignment, mapped to `wagesRm` / `totalPayout` with no OT split. The
 * RECEIVED side is the floor sales the PR's receipts generated, which live in
 * `shift_sale` — recomputed from `payment_voucher_line` by the backend's
 * shift-sale-from-receipts on every receipt approval / edit / delete.
 *
 * Pass `sale` and the money breakdown is real; omit it and Received reads
 * RM 0.00 — which is what every History screen showed before this argument
 * existed. The receipts were reaching the database the whole time; nothing on
 * this side ever read them.
 *
 * The two sides stay separate on purpose: `payAmount` is the wage, and the PR's
 * COMMISSION on those sales is sealed on the voucher line, never re-derived
 * here from a rate card.
 */
export function shiftHistoryRowFromAssignment(args: {
	assignment: ShiftAssignment;
	/** The shift's `YYYY-MM-DD` — from the shift row, or joined onto the assignment. */
	shiftDate: string;
	prName: string;
	outletName: string;
	agencyName: string;
	/** This (shift, PR)'s floor sales. Absent = no receipts logged that night. */
	sale?: ShiftSale;
}): ShiftHistoryRow {
	const { assignment, shiftDate, prName, outletName, agencyName, sale } = args;
	const totalPayout = num(assignment.payAmount);
	return {
		id: assignment.id,
		prId: assignment.prId,
		prName,
		outlet: outletName,
		agencyName,
		dateIso: shiftDate,
		dateDisplay: fmtDateLabelFromIso(shiftDate),
		totalPayout,
		// Wages-only payout: the sealed `payAmount` is the whole figure. It stays
		// wages even when sales exist — the commission on them is on the voucher.
		wagesRm: totalPayout,
		otRm: 0,
		totalDrinks: sale?.drinkUnits ?? 0,
		// 0 vs undefined matters: `resolveShiftDrinkSalesRm` falls back to
		// units × RM150 only when drinkSalesRm is ABSENT. A real sale row of
		// RM 0.00 is a fact, so it has to arrive as the number 0, not a gap.
		drinkSalesRm: sale ? num(sale.drinkSalesRm) : undefined,
		totalTips: sale ? num(sale.tipSalesRm) : 0,
		serviceSalesRm: sale ? num(sale.serviceSalesRm) : undefined,
		durationHours:
			workedHours(assignment.checkInAt, assignment.checkOutAt) ?? 0,
	};
}

/** Key for the (shift, PR) map the hooks build — `shift_sale`'s own unique key. */
export function shiftSaleKey(shiftId: string, prId: string): string {
	return `${shiftId}|${prId}`;
}

/**
 * Index floor sales by (shift, PR) so a history row can find its own night.
 *
 * `shift_sale` is unique on exactly this pair, and `shift_assignment.pr_id`
 * holds the same user id that `shift_sale.pr_id` does — so the join is on ids
 * end to end, with no name matching anywhere in it.
 */
export function indexShiftSales(sales: ShiftSale[]): Map<string, ShiftSale> {
	return new Map(sales.map((s) => [shiftSaleKey(s.shiftId, s.prId), s]));
}
