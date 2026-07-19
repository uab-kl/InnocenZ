import type { ShiftRequest } from "@agency-portal/lib/store";
import type { Shift } from "@/services/shift";

/**
 * Backend shift -> the minimal demo `ShiftRequest` shape that the outlet demand
 * builder (`buildAgencyOutletSummaries` / `buildOutletDayDemandSummaries`)
 * reads. Only the fields those builders touch are populated; the rich
 * outlet-workspace / PNL fields have no backend source and are left off (they
 * only feed cosmetic pay-tier breakdowns, which fall back to defaults).
 *
 * Demand vs supplied: the builders derive `supplied` from the length of `prs`
 * and `demand` from `quantity`, so we synthesize a `prs` array of `filled`
 * placeholder ids to reproduce the backend `filled` count (the demo has no
 * early-release / demand-cut concept here, so demand === quantity and
 * supplied === filled).
 *
 * `destination` is forced to "agency": every backend shift belongs to the
 * signed-in agency and is agency-visible. The backend has no
 * outlet/agency/both destination split — that is a demo-only concept.
 */
export function outletShiftRequestFromBackend(
	shift: Shift,
	outletName: string,
): ShiftRequest {
	const filled = Math.max(0, shift.filled);
	return {
		id: shift.id,
		outletName,
		date: shift.shiftDate,
		dateIso: shift.shiftDate,
		shift: shift.slot ?? shift.eventName ?? "",
		quantity: shift.quantity,
		filled,
		languages: shift.languages ?? "",
		event: shift.eventName ?? "",
		eventKind: shift.eventKind,
		preferredRating: shift.preferredRating ?? 0,
		estimatedCost: Number(shift.estimatedCost) || 0,
		liveSales: Number(shift.liveSales) || 0,
		status: shift.status,
		// `supplied` == prs.length, so N placeholder ids reproduce `filled`.
		prs: Array.from({ length: filled }, (_, i) => `filled-${shift.id}-${i}`),
		payPerHour: Number(shift.payPerHour) || 0,
		destination: "agency",
	};
}
