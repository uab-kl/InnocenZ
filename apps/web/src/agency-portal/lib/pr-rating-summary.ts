import type { AgencyRating } from "@agency-portal/hooks/use-agency-ratings";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";

export interface PrRatingSummary {
	/** The PR's own ratings, in the order the source returned them. */
	rows: AgencyRating[];
	count: number;
	/** Mean stars, or null when this PR has never been rated. */
	average: number | null;
}

/**
 * The ratings belonging to one PR.
 *
 * Matched on `prId` — the id the outlet actually wrote alongside the stars. The
 * previous rule compared display NAMES, which cannot hold across the two
 * portals: the outlet writes its roster's legal name (`prName`) while Manage PR
 * shows the floor nickname, so a real rating was invisible to the agency even
 * though the row pointed straight at the PR.
 *
 * Demo rows carry no `prId`, so they still fall back to the name they were
 * seeded with — that keeps demo sessions rendering exactly as before.
 */
export function ratingsForPr(
	ratings: AgencyRating[],
	pr: Pick<AgencyManagedPR, "id" | "name">,
): AgencyRating[] {
	return ratings.filter((r) => (r.prId ? r.prId === pr.id : r.pr === pr.name));
}

/** Rows plus the derived average for one PR. */
export function summarizePrRatings(
	ratings: AgencyRating[],
	pr: Pick<AgencyManagedPR, "id" | "name">,
): PrRatingSummary {
	const rows = ratingsForPr(ratings, pr);
	if (rows.length === 0) return { rows, count: 0, average: null };
	const total = rows.reduce((sum, r) => sum + r.stars, 0);
	return { rows, count: rows.length, average: total / rows.length };
}

/**
 * The average to show for a PR, or null when there is nothing to show.
 *
 * Backend PRs arrive with `rating: 0` — a placeholder, not a score — because
 * `GET /pr` returns no rating. Real ratings win when they exist; otherwise fall
 * back to the record's own value, which is only meaningful for demo rows, and
 * report null for a genuinely unrated PR so callers can say "not rated yet"
 * instead of "0★".
 */
export function displayAverage(
	pr: Pick<AgencyManagedPR, "rating">,
	summary: PrRatingSummary,
): number | null {
	if (summary.average !== null) return summary.average;
	return pr.rating > 0 ? pr.rating : null;
}

/** One decimal, so a rating reads the same wherever it appears. */
export function formatStars(average: number | null): string {
	return average === null ? "—" : average.toFixed(1);
}
