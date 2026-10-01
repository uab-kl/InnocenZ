import { fetchAllPages } from "@/lib/fetch-all-pages";
import {
	fetchPrPersonnel,
	type PrPersonnelQueryParams,
} from "@/services/pr-personnel";
import { fetchShifts, type ShiftsQueryParams } from "@/services/shift";
import {
	fetchShiftAssignments,
	type ShiftAssignmentsQueryParams,
} from "@/services/shift-assignment";
import { fetchShiftSales } from "@/services/shift-sale";

/**
 * THE OUTLET'S SHARED LIST QUERIES — one definition per cache key.
 *
 * ⚠️ Every list controller clamps `pageSize` to 100 and answers a request for
 * 200 or 500 with 100 rows and no error, so a truncated page looks exactly like
 * a complete one (see `lib/fetch-all-pages.ts`). The outlet screens asked for
 * 200/500 and read one page: the assignments list is ordered OLDEST first with
 * no date filter, so past a venue's 100th booking Today and Post Job would have
 * been reading its oldest hundred rows — nights long gone — while tonight's
 * roster fell off the end.
 *
 * The keys are SHARED (Today + Post Job read one assignments entry; Today,
 * History and the Post Job pool read one PR entry), and React Query keeps one
 * value per key: whichever consumer fetches first decides what the others see.
 * So the fix is here, in one place every consumer imports — patching one call
 * site would leave the others free to fill the key with a single page again.
 */

/** The server's own ceiling. Asking for more returns this many, silently. */
const SERVER_PAGE_SIZE = 100;

/** Today and Post Job — every assignment on this venue's shifts. */
export const outletAssignmentsKey = ["outlet", "today", "assignments"] as const;

/** Today, History and the unfiltered Post Job pool — the venue's PR records. */
export const outletPrsKey = ["outlet", "today", "prs"] as const;

/**
 * History, Today and the Calendar sheet — the venue's floor sales (`shift_sale`,
 * fed from the PRs' APPROVED receipts). Deliberately undated, as History has
 * always read it: a window would leave older nights reading RM 0.00. The
 * endpoint is not paginated, and pins an outlet caller to its own venues.
 */
export const outletShiftSalesKey = [
	"outlet",
	"history",
	"shift-sales",
] as const;

export function fetchOutletShiftSales(onRefreshFail: () => void) {
	return fetchShiftSales({}, onRefreshFail);
}

export function fetchAllOutletShifts(
	params: Omit<ShiftsQueryParams, "page" | "pageSize">,
	onRefreshFail: () => void,
) {
	return fetchAllPages((page) =>
		fetchShifts({ ...params, page, pageSize: SERVER_PAGE_SIZE }, onRefreshFail),
	);
}

export function fetchAllOutletAssignments(
	params: Omit<ShiftAssignmentsQueryParams, "page" | "pageSize">,
	onRefreshFail: () => void,
) {
	return fetchAllPages((page) =>
		fetchShiftAssignments(
			{ ...params, page, pageSize: SERVER_PAGE_SIZE },
			onRefreshFail,
		),
	);
}

export function fetchAllOutletPrs(
	params: Omit<PrPersonnelQueryParams, "page" | "pageSize">,
	onRefreshFail: () => void,
) {
	return fetchAllPages((page) =>
		fetchPrPersonnel(
			{ ...params, page, pageSize: SERVER_PAGE_SIZE },
			onRefreshFail,
		),
	);
}
