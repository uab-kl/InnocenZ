import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import type { PrPersonnel } from "@/services/pr-personnel";

const TIER_LABEL: Record<string, string> = {
	tier_1: "Tier I",
	tier_2: "Tier II",
	tier_3: "Tier III",
};

/**
 * Map a thin backend PR record into the rich demo `AgencyManagedPR` shape.
 * Backend-backed fields carry real data:
 *   - `name`  ← nickname (floor/display name), falling back to legal name
 *   - `icName`← name (legal name)
 *   - `ic`    ← icNo
 *   - `mobile`← phone, `email` ← email
 *   - `trainingLevel` ← tier (labelled), `suspended` ← status
 * The many demo-only fields (rating, KPI, penalties, comcard, attendance,
 * languages, age/height/race, pay class, …) have no backend yet, so they get
 * neutral placeholders. This is the accepted hybrid tradeoff: real where the
 * backend is real, cosmetic placeholders elsewhere.
 */
export function managedPrFromBackend(pr: PrPersonnel): AgencyManagedPR {
	return {
		id: pr.id,
		name: pr.nickname?.trim() || pr.name,
		icName: pr.name,
		ic: pr.icNo ?? "",
		mobile: pr.phone ?? "",
		email: pr.email ?? "",
		age: 0,
		height: 0,
		race: "",
		languages: [],
		place: "",
		yearsExp: 0,
		rating: 0,
		trainingLevel: pr.tier ? (TIER_LABEL[pr.tier] ?? pr.tier) : "—",
		totalPaid: 0,
		attendancePct: 0,
		checkIns: 0,
		checkOuts: 0,
		noShows: 0,
		kpiScore: 0,
		suspended: pr.status === "suspended" || pr.status === "inactive",
		detached: false,
		agencyId: pr.agencyId,
	};
}
