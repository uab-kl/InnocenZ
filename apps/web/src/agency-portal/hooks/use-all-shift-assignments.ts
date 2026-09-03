import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchShiftAssignments } from "@/services/shift-assignment";

/**
 * The one cache key holding this agency's assignment rows.
 *
 * Exported so a mutation can invalidate it by name. A literal copy of the array
 * is how the key and its readers drift apart the day it is renamed.
 */
export const allShiftAssignmentsKey = ["roster", "assignments"] as const;

/**
 * Every shift assignment this agency can see, paged to exhaustion.
 *
 * WHY A SHARED HOOK AND NOT FIVE COPIES. This exact query — same key, same
 * `fetchAllPages` body, same 30s staleTime — was written out five times (roster
 * grid, timetable, history, outlet demand, auto-assign) and a sixth surface,
 * Manage PR's live-status pill, asked the same endpoint under its OWN key with
 * `pageSize: 500`. React Query stores one value per key, so the five agreed by
 * luck while the sixth read something else entirely: the server clamps every
 * list to 100 (see `lib/fetch-all-pages.ts`), so past 100 lifetime rows the
 * pill was deriving "on duty right now" from the agency's OLDEST hundred
 * assignments, ever. Manage PR said "Active" for a PR the Roster showed on a
 * floor, and neither screen could be called the wrong one.
 *
 * One definition means one answer. Callers that must not fetch — a demo session,
 * or a role without the permission behind the endpoint — pass `enabled: false`
 * and still read whatever another mounted caller has already put in the cache.
 */
export function useAllShiftAssignments(params: { enabled?: boolean } = {}) {
	const { enabled = true } = params;
	const { logout } = useAuth();

	return useQuery({
		queryKey: allShiftAssignmentsKey,
		// ⚠️ Paged out, never `pageSize: 500` — the server clamps to 100 and returns
		// the short page with no error, which is indistinguishable from a complete
		// answer. See lib/fetch-all-pages.ts.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShiftAssignments({ page, pageSize: 100 }, logout),
			),
		enabled,
		staleTime: 30_000,
	});
}
