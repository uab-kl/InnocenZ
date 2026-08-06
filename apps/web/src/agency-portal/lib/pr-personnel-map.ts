import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import type { PrPayClass } from "@agency-portal/lib/pr-penalties";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import type { PrPersonnel } from "@/services/pr-personnel";

// Every value of the backend's `pr_tier` enum. It carried only the first three
// while the enum has seven, so a PR on tier_4 or above rendered as the raw
// `tier_4` and could never be matched back to the label the editor shows.
const TIER_LABEL: Record<string, string> = {
	tier_1: "Tier I",
	tier_2: "Tier II",
	tier_3: "Tier III",
	tier_4: "Tier IV",
	tier_5: "Tier V",
	servant: "Servant",
	commission_only: "Commission only",
};

const TIER_VALUE: Record<string, string> = Object.fromEntries(
	Object.entries(TIER_LABEL).map(([value, label]) => [label, value]),
);

/** The `pr_tier` enum value behind a displayed label, or null if unknown. */
export function tierFromLabel(label: string): string | null {
	return TIER_VALUE[label] ?? null;
}

/**
 * The demo shape spells pay class in camelCase; `agency_pr.pay_class` stores the
 * snake_case the rest of the schema uses (`pr_tier` has `commission_only` too).
 */
export function payClassToBackend(payClass: string): string {
	return payClass === "commissionOnly" ? "commission_only" : "basic";
}

export function payClassFromBackend(
	payClass: string | null | undefined,
): PrPayClass {
	return payClass === "commission_only" ? "commissionOnly" : "basic";
}

/** Whole years elapsed since an ISO `YYYY-MM-DD` date of birth. */
export function ageFromDob(dob: string | null | undefined): number {
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
 *   - `comcardImageUrl` ← `user_profile.comcard_image`
 *   - `languages` ← the same user_profile row the PR edits in their own portal
 * The remaining demo-only fields (rating, KPI, penalties, attendance, pay
 * class, …) have no backend yet, so they get neutral placeholders. `rating: 0`
 * is one of those placeholders, NOT a score — see lib/pr-rating-summary.ts,
 * which derives the real average from the `rating` table instead. This is the accepted hybrid tradeoff: real where the backend
 * is real, cosmetic placeholders elsewhere.
 *
 * `0` IS THE ONE SPELLING OF "the account does not carry this" for age, height
 * and weight. It used to be three different spellings — `height ?? 0`,
 * `weight ?? undefined`, `age → 0` — so one blank profile printed "0cm", the
 * invented "52kg" (the weight default downstream) and "0y" side by side. The
 * comcard renderers turn this 0 into an em-dash; nothing may turn it into a
 * number the PR never entered.
 */
export function managedPrFromBackend(pr: PrPersonnel): AgencyManagedPR {
	const profile = pr.profile ?? null;
	const roster = pr.roster ?? null;
	return {
		id: pr.id,
		name: pr.nickname?.trim() || pr.name,
		icName: pr.name,
		ic: pr.icNo ?? "",
		mobile: pr.phone ?? "",
		email: pr.email ?? "",
		age: ageFromDob(profile?.dob),
		height: profile?.comcardHeightCm ?? 0,
		weight: profile?.comcardWeightKg ?? 0,
		race: profile?.race ?? "",
		// R2 KEYS, NOT URLS. The backend stores an object key
		// (`user/<id>/comcard/<uuid>.jpg`) and its own util says so out loud:
		// "Clients prepend R2_PUBLIC_URL". Handing that key straight to an <img
		// src> renders a broken image — exactly what the agency saw on Vicky's
		// comcard while every other fact on the card was correct.
		//
		// `apiAssetUrl` is the resolver the rest of the app already uses: full
		// URLs and data URLs pass through untouched, stored keys get the R2 base
		// prepended, and it falls back to the proxied /img path when R2 is not
		// configured. Never build this URL by hand.
		avatarPhoto: apiAssetUrl(profile?.profileImage) ?? null,
		comcardImageUrl: apiAssetUrl(profile?.comcardImage) ?? null,
		portfolioPhotos: profile?.portfolioPhotos?.map(
			(photo) => apiAssetUrl(photo) ?? photo,
		),
		languages: profile?.languages ?? [],
		// Roster grading, from `agency_pr` (0089). These were hardcoded to ""/0
		// before the columns existed, so the Manage-PR editor could never show
		// what an agency typed even after it was "saved".
		place: roster?.place ?? "",
		yearsExp: roster?.yearsExp ?? 0,
		kpiTier: roster?.kpiTier ?? undefined,
		payClass: payClassFromBackend(roster?.payClass),
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
