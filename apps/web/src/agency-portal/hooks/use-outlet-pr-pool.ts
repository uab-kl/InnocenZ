import type { ComcardPreviewData } from "@agency-portal/components/agency/Comcard3dPreview";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { useOutletRatings } from "./use-outlet-ratings";

/**
 * One selectable PR on the Post Job "Select PRs" picker — the fields the card
 * draws, and nothing else.
 *
 * `rating` is `null` for a PR this outlet has never rated. That is not the same
 * as zero stars, and the card must not print it as one: a backend PR record
 * carries no rating at all (`GET /pr` returns none), so a numeric default would
 * show every unrated PR as 0★ and sort them last.
 */
export interface OutletPrPoolCandidate {
	id: string;
	name: string;
	avatar: string;
	comcardImageUrl: string | null;
	/** Identity + portfolio, so the card can build a comcard when none is saved. */
	comcard: ComcardPreviewData;
	/** Spoken languages from the PR's own profile. */
	languages: string[];
	rating: number | null;
}

export interface UseOutletPrPool {
	/** False for demo sessions — the caller falls back to its demo store. */
	backed: boolean;
	prs: OutletPrPoolCandidate[];
	isLoading: boolean;
}

/** Mean stars per PR from this outlet's own rating rows. */
function averageStarsByPrId(
	rows: { prId: string; stars: number }[],
): Map<string, number> {
	const totals = new Map<string, { sum: number; count: number }>();
	for (const row of rows) {
		if (!row.prId) continue;
		const cur = totals.get(row.prId) ?? { sum: 0, count: 0 };
		totals.set(row.prId, { sum: cur.sum + row.stars, count: cur.count + 1 });
	}
	return new Map(
		[...totals].map(([prId, { sum, count }]) => [prId, sum / count]),
	);
}

/**
 * The PRs an outlet may name on a job post.
 *
 * The Post Job picker used to read the demo store's `prs` slice, which a real
 * login blanks on purpose (`buildBlankPortalReset`), so every backed outlet saw
 * "No PRs available to select" — an empty list that looked like a rule about
 * availability rather than a screen that was never wired.
 *
 * Scope is the server's, not ours: `GET /pr` pins an outlet caller to PRs with
 * an assignment at one of its own venues, so a venue that has never run a shift
 * genuinely has nobody to name yet. The picker says that in words instead of
 * leaving the outlet to guess (see `emptyHint` on DraftPrPicker).
 *
 * Shares `useOutletToday`'s PR query key so the two screens hit one cache entry.
 */
export function useOutletPrPool(): UseOutletPrPool {
	const { logout } = useAuth();
	const backed = getOutletIdentity() !== null;
	const { ratings } = useOutletRatings();

	const prsQuery = useQuery({
		queryKey: ["outlet", "today", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const prs = useMemo<OutletPrPoolCandidate[]>(() => {
		if (!backed) return [];
		const starsByPrId = averageStarsByPrId(ratings);
		return (prsQuery.data?.data ?? [])
			.filter((pr) => pr.status !== "suspended" && pr.status !== "inactive")
			.map((pr) => {
				// The same mapper the outlet's Today/History screens use, so one PR's
				// comcard is built one way across the portal.
				const managed = managedPrFromBackend(pr);
				return {
					id: managed.id,
					name: managed.name,
					// `avatar` is drawn as a TEXT GLYPH, not an image — the demo store
					// puts an emoji here. A URL in this field renders the URL itself at
					// text-4xl across the card. Photos go through `comcard`; this is only
					// the initial shown when a PR has no photo at all.
					avatar: managed.name.charAt(0).toUpperCase(),
					comcardImageUrl: managed.comcardImageUrl ?? null,
					comcard: managed,
					languages: managed.languages ?? [],
					rating: starsByPrId.get(pr.id) ?? null,
				};
			})
			.sort((a, b) => {
				// Rated PRs first, best first; unrated fall to the end by name rather
				// than being ranked as if they had scored zero.
				if (a.rating !== b.rating) {
					if (a.rating === null) return 1;
					if (b.rating === null) return -1;
					return b.rating - a.rating;
				}
				return a.name.localeCompare(b.name);
			});
	}, [backed, prsQuery.data, ratings]);

	return { backed, prs, isLoading: backed && prsQuery.isLoading };
}
