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
 *   - `comcardImageUrl` ← portfolio slot whose path contains "comcard" (backend
 *     has no separate comcard field)
 * The remaining demo-only fields (rating, KPI, penalties, attendance,
 * languages, pay class, …) have no backend yet, so they get neutral
 * placeholders. This is the accepted hybrid tradeoff: real where the backend
 * is real, cosmetic placeholders elsewhere.
 */
export function managedPrFromBackend(pr: PrPersonnel): AgencyManagedPR {
	const profile = pr.profile ?? null;
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
		comcardImageUrl: profile?.comcardImage ?? null,
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
