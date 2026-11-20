import { useQuery } from "@tanstack/react-query";
import { AGENCY_SERVICES_ENABLED } from "@/agency-portal/lib/phase-flags";
import { useAuth } from "@/lib/auth-context";
import {
	type AdminRequestType,
	fetchPendingCount,
} from "@/services/admin-request";
import { fetchAgencies } from "@/services/agency";
import { fetchOutlets } from "@/services/outlet";
import { fetchAdminPendingJobs } from "@/services/special-service";

/**
 * The Plan Request badge's question, shared with the header bell (one cache):
 * every pending request EXCEPT the two types that have pages of their own.
 */
export const PLAN_REQUEST_EXCLUDES: AdminRequestType[] = [
	"plan_change",
	"pr_detach",
];
export const PLAN_REQUEST_COUNT_KEY = [
	"admin-requests",
	"pending-count",
	"without-plan-changes-or-detach",
] as const;
export const PR_DETACH_COUNT_KEY = [
	"admin-requests",
	"pending-count",
	"pr-detach",
] as const;

/**
 * The admin's six work queues, fetched ONCE and read by two surfaces: the
 * sidebar badges (`useSidebarBadges`) and the dashboard's To do panel
 * (`useAdminTodoCounts`). Same query keys, one cache — a panel row and the
 * badge beside its page cannot disagree, which is the rule the agency and
 * outlet To do panels were built on.
 */
function useAdminQueueQueries() {
	const { logout } = useAuth();

	const pendingAgencies = useQuery({
		queryKey: ["dashboard", "pending-agencies-list"],
		queryFn: () =>
			fetchAgencies({ status: "pending_review", page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	const pendingOutlets = useQuery({
		queryKey: ["dashboard", "pending-outlets-list"],
		queryFn: () =>
			fetchOutlets({ status: "pending_review", page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	// Plan changes live on their own page, so the Plan Request badge excludes
	// them and the Plan Change badge counts only pending outlet switches. Keyed
	// under "admin-requests" — the prefix both pages invalidate after a decision
	// — so the badges (and the header bell, which shares them) drop at once.
	// ⚠️ PR detach requests (0171) have their own page too, so they are
	// excluded here as well — counted, a waiting detach would light the Plan
	// Request badge over a page that never lists it. The key changed with the
	// question, so the header bell (which shares it) must use the same one.
	const pendingRequests = useQuery({
		queryKey: PLAN_REQUEST_COUNT_KEY,
		queryFn: () =>
			fetchPendingCount(logout, { excludeType: PLAN_REQUEST_EXCLUDES }),
		staleTime: 30_000,
	});

	const pendingPlanChanges = useQuery({
		queryKey: ["admin-requests", "pending-count", "plan-change"],
		queryFn: () => fetchPendingCount(logout, { type: "plan_change" }),
		staleTime: 30_000,
	});

	// An agency asking to detach a PR tied under a year — Service → PR Detach.
	const pendingPrDetach = useQuery({
		queryKey: PR_DETACH_COUNT_KEY,
		queryFn: () => fetchPendingCount(logout, { type: "pr_detach" }),
		staleTime: 30_000,
	});

	const pendingJobs = useQuery({
		queryKey: ["dashboard", "pending-jobs-list"],
		queryFn: () => fetchAdminPendingJobs({ page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
		enabled: AGENCY_SERVICES_ENABLED,
	});

	return {
		pendingAgencies,
		pendingOutlets,
		pendingRequests,
		pendingPlanChanges,
		pendingPrDetach,
		pendingJobs,
	};
}

/** Live "needs attention" counts for the sidebar, keyed by nav item key. */
export function useSidebarBadges(): Record<string, number> {
	const q = useAdminQueueQueries();
	return {
		"sidebar-user-agency": q.pendingAgencies.data?.pagination.totalCount ?? 0,
		"sidebar-user-outlet": q.pendingOutlets.data?.pagination.totalCount ?? 0,
		"sidebar-service-requests": q.pendingRequests.data?.pending ?? 0,
		"sidebar-service-plan-changes": q.pendingPlanChanges.data?.pending ?? 0,
		"sidebar-service-pr-detach": q.pendingPrDetach.data?.pending ?? 0,
		"sidebar-service-other": AGENCY_SERVICES_ENABLED
			? (q.pendingJobs.data?.pagination.totalCount ?? 0)
			: 0,
	};
}

export type AdminTodoCounts = {
	agencies: number;
	outlets: number;
	planRequests: number;
	planChanges: number;
	prDetach: number;
	jobs: number;
};

/**
 * The same five counts for the dashboard's To do panel — PLUS whether any of
 * them is still loading.
 *
 * ⚠️ The badges can read 0 while a query is in flight; the panel cannot. A
 * badge showing nothing for a second is harmless, but a panel that says "All
 * clear" before its counts arrive tells an admin there is nothing to do when
 * there may be, and they leave. So "all clear" waits for `loading` to be false.
 * An ERRORED query also counts as not-known: an outage must not read as calm.
 */
export function useAdminTodoCounts(): {
	counts: AdminTodoCounts;
	loading: boolean;
} {
	const q = useAdminQueueQueries();
	const known = (query: { isPending: boolean; isError: boolean }) =>
		!query.isPending && !query.isError;
	const queries = [
		q.pendingAgencies,
		q.pendingOutlets,
		q.pendingRequests,
		q.pendingPlanChanges,
		q.pendingPrDetach,
		...(AGENCY_SERVICES_ENABLED ? [q.pendingJobs] : []),
	];
	return {
		counts: {
			agencies: q.pendingAgencies.data?.pagination.totalCount ?? 0,
			outlets: q.pendingOutlets.data?.pagination.totalCount ?? 0,
			planRequests: q.pendingRequests.data?.pending ?? 0,
			planChanges: q.pendingPlanChanges.data?.pending ?? 0,
			prDetach: q.pendingPrDetach.data?.pending ?? 0,
			jobs: AGENCY_SERVICES_ENABLED
				? (q.pendingJobs.data?.pagination.totalCount ?? 0)
				: 0,
		},
		loading: !queries.every(known),
	};
}
