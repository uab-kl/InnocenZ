import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchPendingCount } from "@/services/admin-request";
import { fetchAgencies } from "@/services/agency";
import { fetchOutlets } from "@/services/outlet";
import { fetchAdminPendingJobs } from "@/services/special-service";

/**
 * Live "needs attention" counts for the sidebar, keyed by nav item key.
 * Reuses the dashboard's query keys so both surfaces share one cache entry
 * (no duplicate network calls when the dashboard is also mounted).
 */
export function useSidebarBadges(): Record<string, number> {
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

	const pendingRequests = useQuery({
		queryKey: ["dashboard", "pending-requests-count"],
		queryFn: () => fetchPendingCount(logout),
		staleTime: 30_000,
	});

	const pendingJobs = useQuery({
		queryKey: ["dashboard", "pending-jobs-list"],
		queryFn: () => fetchAdminPendingJobs({ page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	return {
		"sidebar-user-agency": pendingAgencies.data?.pagination.totalCount ?? 0,
		"sidebar-user-outlet": pendingOutlets.data?.pagination.totalCount ?? 0,
		"sidebar-service-requests": pendingRequests.data?.pending ?? 0,
		"sidebar-service-other": pendingJobs.data?.pagination.totalCount ?? 0,
	};
}
