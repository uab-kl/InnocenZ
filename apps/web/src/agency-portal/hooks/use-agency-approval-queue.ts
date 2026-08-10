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
	/** PR MC / leave requests parked at `leave_pending`. */
	leaveRequests: ShiftAssignment[];
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
			fetchShiftAssignments({ status: "leave_pending", pageSize: 100 }, logout),
		staleTime: 15_000,
	});
	const leaveRequests = useMemo(
		() => leaveQuery.data?.data ?? [],
		[leaveQuery.data],
	);

	return {
		signups,
		linkRequests,
		cutlostRequests,
		leaveRequests,
		total:
			signups.length +
			linkRequests.length +
			cutlostRequests.length +
			leaveRequests.length,
		isLoading: liveCutlost.isLoading || leaveQuery.isLoading,
		leaveIsLoading: leaveQuery.isLoading,
		backend,
		cutlost: liveCutlost,
	};
}
