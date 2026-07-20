import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import type { ShiftAssignment } from "@/services/shift-assignment";

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
 * A completed backend shift-assignment -> the demo `ShiftHistoryRow` the History
 * tabs render (By PR / By outlet rollups + the shift-detail sheet). The sealed
 * payout is a single figure on the assignment (`payAmount`), so it maps to
 * `wagesRm` and `totalPayout` with no drink/tip/OT split — the backend has no
 * per-shift sales data, so those parts stay 0 and the breakdown shows wages
 * only. `totalDrinks` / `totalTips` are 0 for the same reason (a cosmetic
 * placeholder, like the other wired screens).
 */
export function shiftHistoryRowFromAssignment(args: {
	assignment: ShiftAssignment;
	/** The shift's `YYYY-MM-DD` — from the shift row, or joined onto the assignment. */
	shiftDate: string;
	prName: string;
	outletName: string;
	agencyName: string;
}): ShiftHistoryRow {
	const { assignment, shiftDate, prName, outletName, agencyName } = args;
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
		// Wages-only breakdown: the sealed `payAmount` is the whole payout; with
		// drinks/tips 0 the commission parts resolve to 0 too.
		wagesRm: totalPayout,
		otRm: 0,
		totalDrinks: 0,
		totalTips: 0,
		durationHours:
			workedHours(assignment.checkInAt, assignment.checkOutAt) ?? 0,
	};
}
