import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchRatings, type RatingRecord } from "@/services/rating";

/**
 * Keyed by the outlet, not just by "outlet ratings". Two venues' rating sets are
 * different data, so a flat key would serve the previous venue's rows from cache
 * to whoever signed in next on the same tab.
 */
const outletRatingsKey = (outletId: string) =>
	["outlet", "ratings", outletId] as const;

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
 * Scoped to the SIGNED-IN VENUE, which is narrower than the server's own scope
 * and has to be. `GET /rating` pins an outlet caller to `scope.outletIds` —
 * every venue the account is an active member of — so an operator running two
 * venues used to get both sets pooled under one key while the portal was pinned
 * to one of them. The Post Job picker averages these into its ranking
 * (`use-outlet-pr-pool`), so venue A was ordering its candidates partly on
 * venue B's opinions, and the ratings screen listed verdicts the operator never
 * wrote here. `outletId` only ever narrows: the server ANDs it inside
 * `scope.outletIds`, so this cannot be used to read a venue the account does not
 * hold.
 */
export function useOutletRatings(): UseOutletRatingsResult {
	const { logout } = useAuth();
	const identity = getOutletIdentity();
	const outletId = identity?.outletId ?? "";
	const backed = identity !== null;

	const ratingsQuery = useQuery({
		queryKey: outletRatingsKey(outletId),
		queryFn: () => fetchRatings({ outletId }, logout),
		// An identity with no outletId would fall back to the pooled read, so
		// require it rather than send a request that quietly widens the scope.
		enabled: backed && Boolean(outletId),
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
