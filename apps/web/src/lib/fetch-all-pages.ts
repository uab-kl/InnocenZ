/**
 * Read every page of a paginated list endpoint.
 *
 * ⚠️ **Asking for a big `pageSize` does NOT work.** Every list controller clamps
 * to `MAX_PAGE_SIZE = 100` and silently returns 100 rows for a request that said
 * 500 — no error, no warning, and `data.length` looks like a complete answer.
 * That is how the auto-assign planner came to read an agency's *oldest 100
 * assignment rows, ever* (the assignments query has no date filter and orders
 * `created_at` ASCENDING), which past 101 lifetime rows meant every current
 * shift read as fully unstaffed: tier caps evaporated, booked PRs were proposed,
 * and the confirm-time revalidation was blind for exactly the same reason.
 *
 * A truncated page is indistinguishable from a short one, so callers that need a
 * COMPLETE set must page to exhaustion rather than trust a single response.
 */

/** The pagination envelope every list endpoint in this app returns. */
type PagedResponse<T> = {
	data: T[];
	pagination?: {
		page?: number;
		totalPages?: number;
		hasNextPage?: boolean;
	};
};

/**
 * A backstop against an endpoint whose `hasNextPage` never goes false. At the
 * server's 100-row cap this is 20,000 rows — far beyond any real agency week,
 * and small enough that a broken endpoint costs a bounded number of requests
 * rather than hanging the screen forever.
 */
const MAX_PAGES = 200;

/**
 * Calls `fetchPage(page)` from page 1 until the server says there is no next
 * page, and returns every row under the SAME `{ data }` envelope one page has.
 *
 * ⚠️ The envelope is deliberate, not clumsy. These list queries are cached under
 * SHARED react-query keys (`["roster","assignments"]`, `["roster","prs"]`,
 * `["roster","shifts",…]`) by seven different hooks and components. React Query
 * stores one value per key, so whichever consumer fetches first decides the shape
 * every other consumer reads — and each `useQuery` infers its type from its own
 * `queryFn`, so a mismatch type-checks cleanly and only explodes at runtime.
 * Returning `{ data }` keeps every existing `q.data?.data ?? []` reader correct,
 * which is what lets all seven call sites move together in one line each.
 *
 * Sequential on purpose: `totalPages` is unknown until the first response, and
 * firing speculative parallel requests at a shared backend to save a round trip
 * on a query that is usually one page is a poor trade.
 *
 * Stops on the FIRST of: `hasNextPage === false`, `page >= totalPages`, an empty
 * page, or `MAX_PAGES`. A response carrying no `pagination` block stops after one
 * page — that is an endpoint which does not paginate, not an infinite one.
 */
export async function fetchAllPages<T>(
	fetchPage: (page: number) => Promise<PagedResponse<T>>,
): Promise<{ data: T[] }> {
	const rows: T[] = [];
	for (let page = 1; page <= MAX_PAGES; page += 1) {
		const response = await fetchPage(page);
		rows.push(...response.data);

		const pagination = response.pagination;
		if (!pagination) break;
		if (response.data.length === 0) break;
		if (pagination.hasNextPage === false) break;
		if (
			pagination.hasNextPage === undefined &&
			typeof pagination.totalPages === "number" &&
			page >= pagination.totalPages
		) {
			break;
		}
	}
	return { data: rows };
}
