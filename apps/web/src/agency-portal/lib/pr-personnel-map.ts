import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import type { PrPersonnel } from "@/services/pr-personnel";

const TIER_LABEL: Record<string, string> = {
	tier_1: "Tier I",
	tier_2: "Tier II",
	tier_3: "Tier III",
};

/** Whole years elapsed since an ISO `YYYY-MM-DD` date of birth. */
function ageFromDob(dob: string | null | undefined): number {
	if (!dob) return 0;
	const born = new Date(dob);
	if (Number.isNaN(born.getTime())) return 0;
	const now = new Date();
	let age = now.getFullYear() - born.getFullYear();
	const beforeBirthday =
		now.getMonth() < born.getMonth() ||
		(now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
	if (beforeBirthday) age -= 1;
	return age > 0 ? age : 0;
}

/**
 * Map a thin backend PR record into the rich demo `AgencyManagedPR` shape.
 * Backend-backed fields carry real data:
 *   - `name`  ← nickname (floor/display name), falling back to legal name
 *   - `icName`← name (legal name)
 *   - `ic`    ← icNo
 *   - `mobile`← phone, `email` ← email
 *   - `trainingLevel` ← tier (labelled), `suspended` ← status
 *   - comcard identity (`age`/`height`/`weight`/`race`, avatar, portfolio) ←
 *     the linked user account's profile — the same source the admin PR screen
 *     reads, so both screens show one PR the same way
 * The remaining demo-only fields (rating, KPI, penalties, attendance,
 * languages, pay class, …) have no backend yet, so they get neutral
 * placeholders. This is the accepted hybrid tradeoff: real where the backend
 * is real, cosmetic placeholders elsewhere.
 */
export function managedPrFromBackend(pr: PrPersonnel): AgencyManagedPR {
	const profile = pr.profile ?? null;
	return {
		id: pr.id,
		name: pr.nickname?.trim() || pr.name,
		icName: pr.name,
		ic: pr.icNo ?? "",
		mobile: pr.phone ?? "",
		email: pr.email ?? "",
		age: ageFromDob(profile?.dob),
		height: profile?.comcardHeightCm ?? 0,
		weight: profile?.comcardWeightKg ?? undefined,
		race: profile?.race ?? "",
		avatarPhoto: profile?.profileImage ?? null,
		portfolioPhotos: profile?.portfolioPhotos ?? undefined,
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
