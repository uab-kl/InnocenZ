import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchRatings, type RatingRecord } from "@/services/rating";

const RATINGS_KEY = ["agency", "ratings"] as const;

/**
 * The shape both readers already render. `pr` is the display NAME, not an id,
 * because Manage PR and the shift history log both match on
 * `r.pr === detail.name`.
 */
export interface AgencyRating {
	id: string;
	pr: string;
	stars: number;
	note: string;
	date: string;
	tags?: string[];
}

/** "12 Jul 2026" — matches the demo rows' `date` field. */
function displayDate(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return "";
	return at.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function ratingFromBackend(record: RatingRecord): AgencyRating {
	return {
		id: record.id,
		pr: record.prName,
		stars: record.stars,
		note: record.note ?? "",
		date: displayDate(record.createdAt),
		tags: record.tags ?? [],
	};
}

export interface UseAgencyRatingsResult {
	/** False for demo sessions — the caller falls back to its demo store. */
	backed: boolean;
	ratings: AgencyRating[];
	isLoading: boolean;
}

/**
 * Ratings an outlet left on this agency's PRs.
 *
 * These have always been WRITTEN to the `rating` table — the outlet's rate
 * sheet posts them — but nothing ever read them back, so the agency saw only
 * demo rows and a real rating was invisible. `@/services/rating` had exactly one
 * importer before this hook: the demo store, for the write.
 *
 * No client-side tenant filter: GET /rating resolves the caller's org
 * server-side and returns only what belongs to it.
 */
export function useAgencyRatings(): UseAgencyRatingsResult {
	const { logout } = useAuth();
	const backed = getAgencyIdentity() !== null;

	const ratingsQuery = useQuery({
		queryKey: RATINGS_KEY,
		queryFn: () => fetchRatings({}, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const ratings = useMemo<AgencyRating[]>(
		() => (ratingsQuery.data?.data ?? []).map(ratingFromBackend),
		[ratingsQuery.data],
	);

	return { backed, ratings, isLoading: ratingsQuery.isLoading };
}
