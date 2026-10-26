import type { SubscriptionPagination } from "@/services/subscription";

/**
 * One page of the plan catalogue, cheapest first ACROSS THE WHOLE CATALOGUE.
 *
 * The table used to sort whatever page the server returned, on the assumption
 * that every plan fit on one page. At 13 plans and 10 per page the server's
 * (unordered) first page was sorted on its own and page 2 held whatever was
 * left, so a cheap plan could sit on page 2 under a dearer one on page 1. The
 * catalogue is small, so it is fetched whole, sorted once, then sliced.
 */
export function pagePlansByPrice<T extends { price: string; name: string }>(
	plans: readonly T[],
	page: number,
	pageSize: number,
): { rows: T[]; pagination: SubscriptionPagination } {
	const sorted = [...plans].sort(
		(a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name),
	);
	const totalCount = sorted.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
	// A filter can shrink the list under the page the admin was on.
	const current = Math.min(Math.max(1, page), totalPages);
	const start = (current - 1) * pageSize;
	return {
		rows: sorted.slice(start, start + pageSize),
		pagination: {
			page: current,
			pageSize,
			totalCount,
			totalPages,
			hasNextPage: current < totalPages,
			hasPrevPage: current > 1,
		},
	};
}
