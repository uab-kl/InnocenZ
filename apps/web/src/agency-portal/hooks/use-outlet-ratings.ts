import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchRatings, type RatingRecord } from "@/services/rating";

const OUTLET_RATINGS_KEY = ["outlet", "ratings"] as const;

/** One rating this outlet has left on a PR. */
export interface OutletRating {
	id: string;
	prId: string;
	prName: string;
	stars: number;
	note: string;
	tags: string[];
	/** ISO, kept for sorting — `dateLabel` is what the screen prints. */
	createdAt: string;
	dateLabel: string;
}

/** "12 Jul 2026" — matches how the agency side prints a rating date. */
function displayDate(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return "";
	return at.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function outletRatingFromBackend(record: RatingRecord): OutletRating {
	return {
		id: record.id,
		prId: record.prId,
		prName: record.prName,
		stars: record.stars,
		note: record.note ?? "",
		tags: record.tags ?? [],
		createdAt: record.createdAt,
		dateLabel: displayDate(record.createdAt),
	};
}

export interface UseOutletRatingsResult {
	/** False for demo sessions — the caller falls back to its demo store. */
	backed: boolean;
	ratings: OutletRating[];
	isLoading: boolean;
	isError: boolean;
	refetch: () => void;
}

/**
 * The ratings THIS outlet has left on PRs.
 *
 * The outlet side of `rating` has been write-only since it was built: the
 * post-seal prompt on Today posts a rating, and the agency can read them back
 * (`use-agency-ratings`), but the outlet that wrote one had no way to see it
 * again — not to check what it had said, and not to notice it had rated the same
 * PR twice. `POST /rating` upserts on (outlet, PR), so what the outlet needs to
 * see is one current verdict per PR, not an append-only log.
 *
 * No client-side tenant filter: `GET /rating` resolves the caller's org
 * server-side and returns only that outlet's rows.
 */
export function useOutletRatings(): UseOutletRatingsResult {
	const { logout } = useAuth();
	const backed = getOutletIdentity() !== null;

	const ratingsQuery = useQuery({
		queryKey: OUTLET_RATINGS_KEY,
		queryFn: () => fetchRatings({}, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const ratings = useMemo<OutletRating[]>(() => {
		const mapped = (ratingsQuery.data?.data ?? []).map(outletRatingFromBackend);
		// Newest first — the outlet reads this as "what did we say most recently".
		return mapped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [ratingsQuery.data]);

	return {
		backed,
		ratings,
		isLoading: ratingsQuery.isLoading,
		isError: ratingsQuery.isError,
		refetch: () => {
			void ratingsQuery.refetch();
		},
	};
}
