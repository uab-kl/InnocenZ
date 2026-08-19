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
 * ⚠️ COUNTING THE ASSIGNMENTS YOU CAN SEE IS NOT COUNTING THE SHIFT.
 * `GET /shift-assignment` is scoped to the CALLER's agency, and since 0124 one
 * outlet shift can be posted to several agencies at once. So an agency counting
 * the rows it can see counts only its OWN contribution: with Atlas filling one
 * of a 2-slot shift, Atlas read 2/1 and Why We Met read 2/0 off the same shift,
 * and Why We Met was offered a seat that was already taken. `GET /shift` ships
 * `staffedCount` / `staffedBuckets` for exactly this — the totals across every
 * invited agency — and they are what this screen must show. `prs` stays the
 * caller's own ids: it answers "which of MY people are on this", which is a
 * different question and the only one those ids can honestly answer.
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
		// Everyone on the shift, from every agency — see the warning above. Falls
		// back to the local count only when the server did not send one: the
		// backend THROWS rather than returning 0 if that count fails, precisely so
		// a failure reads as "unknown" here instead of as "nobody is on it".
		suppliedTotal: shift.staffedCount ?? staffing.length,
		filled: shift.staffedCount ?? staffing.length,
		// Seats taken per tier, again across every agency. The agency cannot derive
		// this for a shift another agency helped fill: a tier is a fact about that
		// PR's membership of THEIR agency, which this one cannot read.
		suppliedByTierBucket: shift.staffedBuckets,
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
