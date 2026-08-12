import { useAgencyPendingPrs } from "@agency-portal/hooks/use-agency-pending-prs";
import { useCutlostRequests } from "@agency-portal/hooks/use-cutlost-requests";
import type { PendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import { toPendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import type { PendingAgencyLink, PendingPR } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchShiftAssignments,
	type ShiftAssignment,
} from "@/services/shift-assignment";

export interface AgencyApprovalQueue {
	/** Pending `agency_pr` sign-ups — backend on a real login, demo store otherwise. */
	signups: PendingPR[];
	/** PRs asking to tie themselves to this agency (demo-only slice today). */
	linkRequests: PendingAgencyLink[];
	/** Outlet cutlost requests awaiting an agency decision. */
	cutlostRequests: PendingCutlostRequest[];
	/** PR MC / leave requests still awaiting a decision (leave_status=pending). */
	leaveRequests: ShiftAssignment[];
	/**
	 * Decided MC / leave requests — approved AND rejected. Kept separate from
	 * `leaveRequests` because the queue is work-to-do and this is the record;
	 * filtered on leave_status, since a rejection reverts `status` to `assigned`
	 * and so is invisible to a status filter.
	 */
	leaveHistory: ShiftAssignment[];
	/** Only the history query — the tab renders its own loading line. */
	leaveHistoryIsLoading: boolean;
	/** Everything the Approvals page's three tabs add up to. */
	total: number;
	isLoading: boolean;
	/** Only the MC/leave query — the Approvals page shows its own loading line. */
	leaveIsLoading: boolean;
	/** Sign-up approve / reject / invite, for the review surface. */
	backend: ReturnType<typeof useAgencyPendingPrs>;
	/** Cutlost decide / raise, for the review surface. */
	cutlost: ReturnType<typeof useCutlostRequests>;
}

/**
 * The agency Approvals queue, as ONE source.
 *
 * The Today hub's "Pending approvals" tile used to count `useStore` slices
 * directly — the demo store — while `/agency/pending` read the backend. On a
 * real login the demo slices boot blank, so the tile sat at 0 while the page it
 * links to listed real work. The tile also had no MC/leave term at all, so a
 * leave request could never move it however it was sourced.
 *
 * Every query key here is the one the Approvals page already uses, so the two
 * screens share a react-query cache entry rather than two copies that can drift.
 */
export function useAgencyApprovalQueue(): AgencyApprovalQueue {
	const { logout } = useAuth();
	const pendingPRs = useStore((s) => s.pendingPRs);
	const pendingAgencyLinks = useStore((s) => s.pendingAgencyLinks);
	const pendingCutlostRequests = useStore((s) => s.pendingCutlostRequests);
	const activeAgencyId = useStore((s) => s.activeAgencyId);

	// Real login → real pending PRs; demo store otherwise. Same `backed` split
	// the Approvals page uses.
	const backend = useAgencyPendingPrs();
	const demoSignups = useMemo(
		() =>
			pendingPRs.filter(
				(p) =>
					p.status === "pending" && (p.agencyId ?? "atlas") === activeAgencyId,
			),
		[pendingPRs, activeAgencyId],
	);
	const signups = backend.backed ? backend.signups : demoSignups;

	const linkRequests = useMemo(
		() =>
			pendingAgencyLinks.filter(
				(l) => l.status === "pending" && l.agencyId === activeAgencyId,
			),
		[pendingAgencyLinks, activeAgencyId],
	);

	const liveCutlost = useCutlostRequests({ status: "pending" });
	const cutlostRequests = useMemo(
		() =>
			liveCutlost.backed
				? liveCutlost.requests.map(toPendingCutlostRequest)
				: pendingCutlostRequests.filter((r) => r.status === "pending"),
		[liveCutlost.backed, liveCutlost.requests, pendingCutlostRequests],
	);

	// MC/leave rows are backend-only — there is no demo slice behind them, so a
	// demo session simply has none.
	const leaveQuery = useQuery({
		queryKey: ["roster", "leave-requests"],
		queryFn: () =>
			// leave_status, not status: it is the one field that means "awaiting a
			// decision" for both a fresh request and a re-filed one.
			fetchShiftAssignments({ leaveStatus: "pending", pageSize: 100 }, logout),
		staleTime: 15_000,
	});
	const leaveRequests = useMemo(
		() => leaveQuery.data?.data ?? [],
		[leaveQuery.data],
	);

	// Decided requests. A rejection reverts `status` to `assigned`, so there is
	// no status value that would find it — only leave_status can.
	const leaveHistoryQuery = useQuery({
		queryKey: ["roster", "leave-history"],
		queryFn: () =>
			fetchShiftAssignments(
				{ leaveStatus: "approved,rejected", pageSize: 200 },
				logout,
			),
		staleTime: 15_000,
	});
	const leaveHistory = useMemo(
		() => leaveHistoryQuery.data?.data ?? [],
		[leaveHistoryQuery.data],
	);

	return {
		signups,
		linkRequests,
		cutlostRequests,
		leaveRequests,
		leaveHistory,
		// History is the record, not work-to-do — deliberately NOT in `total`,
		// which drives the "needs your attention" count.
		total:
			signups.length +
			linkRequests.length +
			cutlostRequests.length +
			leaveRequests.length,
		isLoading: liveCutlost.isLoading || leaveQuery.isLoading,
		leaveIsLoading: leaveQuery.isLoading,
		leaveHistoryIsLoading: leaveHistoryQuery.isLoading,
		backend,
		cutlost: liveCutlost,
	};
}
