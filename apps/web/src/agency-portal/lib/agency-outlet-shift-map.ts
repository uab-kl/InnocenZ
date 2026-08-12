import type { ShiftRequest } from "@agency-portal/lib/store";
import type { Shift } from "@/services/shift";
import type { ShiftAssignment } from "@/services/shift-assignment";

/**
 * Backend shift -> the minimal demo `ShiftRequest` shape that the outlet demand
 * builder (`buildAgencyOutletSummaries` / `buildOutletDayDemandSummaries`)
 * reads. Only the fields those builders touch are populated; the rich
 * outlet-workspace / PNL fields have no backend source and are left off (they
 * only feed cosmetic pay-tier breakdowns, which fall back to defaults).
 *
 * Demand vs supplied: the builders derive `demand` from `quantity` and
 * `supplied` from **`prs.length`**, so `prs` must carry the real assignment PR
 * ids — the same thing `shiftRequestFromBackendShift` does for the outlet Today
 * cards.
 *
 * ⚠️ This used to synthesize `prs` as N placeholder ids counted from
 * `shift.filled`. Nothing in the backend increments that column, so `filled` was
 * always 0, `prs` was always `[]`, and **every backend shift on /agency/outlets
 * reported as fully unstaffed** — overstating open slots by exactly the number
 * of PRs actually rostered, on a screen whose roster-derived figures were right.
 * Never reintroduce a count taken from `shift.filled`; count assignments.
 *
 * `destination` is forced to "agency": every backend shift belongs to the
 * signed-in agency and is agency-visible. The backend has no
 * outlet/agency/both destination split — that is a demo-only concept.
 */
export function outletShiftRequestFromBackend(
	shift: Shift,
	outletName: string,
	assignments: ShiftAssignment[] = [],
): ShiftRequest {
	// Cancelled / no-show / leave-approved PRs are not staffing the shift — the
	// slot is open again. Mirrors the backend's NON_STAFFING_STATUSES and the
	// identical filter in `shiftRequestFromBackendShift`.
	const staffing = assignments.filter(
		(a) =>
			a.shiftId === shift.id &&
			a.status !== "cancelled" &&
			a.status !== "no_show" &&
			a.status !== "leave_approved",
	);
	return {
		id: shift.id,
		outletName,
		date: shift.shiftDate,
		dateIso: shift.shiftDate,
		shift: shift.slot ?? shift.eventName ?? "",
		quantity: shift.quantity,
		filled: staffing.length,
		languages: shift.languages ?? "",
		event: shift.eventName ?? "",
		eventKind: shift.eventKind,
		preferredRating: shift.preferredRating ?? 0,
		estimatedCost: Number(shift.estimatedCost) || 0,
		liveSales: Number(shift.liveSales) || 0,
		status: shift.status,
		// Real PR ids, so the detail panels can match these against roster slots
		// instead of against invented `filled-<id>-<n>` strings that match nothing.
		prs: staffing.map((a) => a.prId),
		payPerHour: Number(shift.payPerHour) || 0,
		destination: "agency",
	};
}
