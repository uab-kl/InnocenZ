import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import {
	type PartyAcceptance,
	recomputeSpecialServiceStatus,
	type SpecialServiceRecord,
} from "@agency-portal/lib/special-service-demo";
import type {
	SpecialService,
	SpecialServiceAdminAccepted,
} from "@/services/special-service";

/** Backend `n_a` → demo `n/a`; the other values share spelling. */
function adminAcceptanceFromBackend(
	value: SpecialServiceAdminAccepted,
): PartyAcceptance {
	return value === "n_a" ? "n/a" : value;
}

/**
 * Split a backend ISO datetime into the demo's separate `dateIso` (YYYY-MM-DD)
 * and `time` (HH:MM) fields. Falls back to `createdAt` when a job carries no
 * scheduled slot. Sliced (not tz-converted) — prototype-level precision.
 */
function splitScheduled(
	scheduledFor: string | null,
	createdAt: string,
): { dateIso: string; time: string } {
	const source = scheduledFor ?? createdAt;
	return {
		dateIso: source.slice(0, 10),
		time: source.length >= 16 ? source.slice(11, 16) : "",
	};
}

/**
 * Map a backend `SpecialService` row into the rich demo `SpecialServiceRecord`
 * the Job Posting table + filters consume. Backend-backed fields carry real
 * data (category, budget, description, schedule, admin review status). Fields
 * with no backend equivalent get neutral placeholders: `amountOut` (admin
 * arranged cost) is 0 → the Cost column shows "—", and PR attribution is blank
 * because agency job postings are outlet+service, not PR-specific. This is the
 * accepted hybrid tradeoff — real where the backend is real, cosmetic elsewhere.
 */
export function specialServiceRecordFromBackend(
	service: SpecialService,
): SpecialServiceRecord {
	const { dateIso, time } = splitScheduled(
		service.scheduledFor,
		service.createdAt,
	);
	const isOthers = service.category === "others";

	const base: SpecialServiceRecord = {
		id: service.id,
		prId: "",
		prName: "",
		outlet: service.outletName,
		date: fmtDateLabelFromIso(dateIso),
		dateIso,
		time,
		serviceType: service.category,
		customServiceName: isOthers ? service.title : undefined,
		description: service.description?.trim() || service.title,
		amountIn: service.budget != null ? Number(service.budget) : 0,
		amountOut: 0,
		initiatedBy: service.initiatedBy,
		raisedBy:
			service.initiatedBy === "outlet"
				? service.outletName
				: (service.postingAgencyName ?? "Agency"),
		adminAccepted: adminAcceptanceFromBackend(service.adminAccepted),
		agencyAccepted: "accepted",
		prAcceptance: "n/a",
		outletAcceptance: "n/a",
		status: "pending_admin",
	};

	return { ...base, status: recomputeSpecialServiceStatus(base) };
}
