import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import type { PrPayClass } from "@agency-portal/lib/pr-penalties";
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
 * Backend has no dedicated comcard column — sample seeds (and some uploads) keep
 * the rendered photo comcard inside `portfolio_photos` (e.g. `vicky-comcard.png`).
 * Pull that out so agency UI can treat it as `comcardImageUrl` instead of only
 * showing it in the gallery / falling back to the 3D silhouette.
 *
 * Also repairs demo Vicky portfolios where a later user-upload slot 404s but the
 * neighboring slots are still the seed gallery photos — swap those broken
 * `/img/users/portfolio/…` paths back to the matching `vicky-N.png` seed.
 */
export function splitPortfolioComcard(
	photos: (string | null)[] | null | undefined,
): {
	comcardImageUrl: string | null;
	portfolioPhotos: (string | null)[] | undefined;
} {
	if (!photos?.length) {
		return { comcardImageUrl: null, portfolioPhotos: photos ?? undefined };
	}

	const repaired = repairDemoGalleryUploads(photos);

	let comcardImageUrl: string | null = null;
	const portfolioPhotos: (string | null)[] = [];
	for (const src of repaired) {
		if (src && /comcard/i.test(src) && !comcardImageUrl) {
			comcardImageUrl = src;
			continue;
		}
		portfolioPhotos.push(src);
	}

	// Demo Vicky seed: gallery portraits without a comcard slot still have a
	// known photo-comcard asset we can show in the comcard panel.
	if (
		!comcardImageUrl &&
		portfolioPhotos.some((p) => p && /\/img\/pr\/gallery\/vicky-\d/i.test(p))
	) {
		comcardImageUrl = "/img/pr/gallery/vicky-comcard.png";
	}

	return {
		comcardImageUrl,
		portfolioPhotos: portfolioPhotos.some(Boolean)
			? portfolioPhotos
			: undefined,
	};
}

/** Replace orphaned user-upload slots with seed gallery peers when present. */
function repairDemoGalleryUploads(
	photos: (string | null)[],
): (string | null)[] {
	const hasSeedGallery = photos.some(
		(p) => p && /\/img\/pr\/gallery\/vicky-\d+\.png$/i.test(p),
	);
	if (!hasSeedGallery) return photos;

	return photos.map((src, index) => {
		if (!src || !/\/img\/users\/portfolio\//i.test(src)) return src;
		const seed = `/img/pr/gallery/vicky-${index + 1}.png`;
		return seed;
	});
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
 *   - `comcardImageUrl` ← dedicated `user_profile.comcard_image` when set; otherwise a
 *     portfolio slot whose path contains "comcard" (older seeds had no separate field)
 *   - `languages` ← the same user_profile row the PR edits in their own portal
 * The remaining demo-only fields (rating, KPI, penalties, attendance, pay
 * class, …) have no backend yet, so they get neutral placeholders. `rating: 0`
 * is one of those placeholders, NOT a score — see lib/pr-rating-summary.ts,
 * which derives the real average from the `rating` table instead. This is the accepted hybrid tradeoff: real where the backend
 * is real, cosmetic placeholders elsewhere.
 */
export function managedPrFromBackend(pr: PrPersonnel): AgencyManagedPR {
	const profile = pr.profile ?? null;
	const roster = pr.roster ?? null;
	const { comcardImageUrl, portfolioPhotos } = splitPortfolioComcard(
		profile?.portfolioPhotos,
	);
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
		comcardImageUrl: profile?.comcardImage ?? comcardImageUrl,
		portfolioPhotos: portfolioPhotos ?? profile?.portfolioPhotos ?? undefined,
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
