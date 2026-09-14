import { useAgencyOutletLinks } from "@agency-portal/hooks/use-agency-outlet-links";
import { useAgencyPendingPrs } from "@agency-portal/hooks/use-agency-pending-prs";
import { useCutlostRequests } from "@agency-portal/hooks/use-cutlost-requests";
import { useOrgMembersQuery } from "@agency-portal/hooks/use-org-members";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { isMemberWaiting } from "@agency-portal/lib/member-queue-state";
import type { PendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import { toPendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import type { PendingAgencyLink, PendingPR } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import type { AgencyOutletLink } from "@/services/agency-outlet";
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
	/** Venues asking to link to this agency (`agency_outlet`, 0123). */
	outletLinkRequests: AgencyOutletLink[];
	/**
	 * People asking to join this agency's TEAM — the "New member" tab.
	 *
	 * A count, not the rows: the panel behind that tab reads the same query key
	 * and does its own filtering, so handing the list up here would be a second
	 * copy of it to keep honest.
	 */
	pendingMembers: number;
	/** Everything the Approvals page's tabs add up to. */
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

	/*
	 * ⚠️ THE SAME KEY the Approvals page reads, and the same one the Team screen
	 * writes through — so the rail badge, the "New member" tab count and the
	 * panel itself cannot disagree, and it costs no extra request.
	 *
	 * It was missing entirely. This total drives the Approvals badge AND the
	 * Today tile, and neither carried a member term, so somebody could sit in
	 * the queue while the rail said nothing was waiting — exactly the drift the
	 * comment below describes for venues, happening a second time.
	 */
	const memberOrgId = useMemo(() => getAgencyIdentity()?.agencyId ?? null, []);
	const memberRows = useOrgMembersQuery("agency", memberOrgId);
	/*
	 * ⚠️ `waiting`, NOT `!== "active"` — a badge counts WORK, not history.
	 *
	 * The four statuses are `pending | active | rejected | inactive`, so "not
	 * active" swept in `rejected` (already declined) and `inactive` (someone who
	 * worked here and was switched off). Both are decisions ALREADY TAKEN, and
	 * neither is something the owner can act on: Atlas showed a rail badge of 2
	 * and a "New member (2)" tab over a queue reading "Waiting (0) · Declined (1)
	 * · Deactivated (1)" — the 2 WAS the declined row plus the deactivated one.
	 *
	 * `isMemberWaiting` is reused rather than re-spelling `=== "pending"` here,
	 * because the queue list already owns that vocabulary and a count must agree
	 * with the list it labels. That panel had this exact bug once before — a
	 * declined applicant matching `!== "active"` sat in its Waiting list — and it
	 * was fixed THERE while these counts kept the old predicate. One authority,
	 * so a third spelling cannot drift away from it again.
	 */
	const pendingMembers = useMemo(
		() => (memberRows.data ?? []).filter(isMemberWaiting).length,
		[memberRows.data],
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

	// Venues waiting to be let in. Same hook the Outlet-Linking tab uses, so the
	// tile and the tab share one react-query entry and cannot disagree.
	const outletLinks = useAgencyOutletLinks("pending");

	return {
		signups,
		linkRequests,
		cutlostRequests,
		leaveRequests,
		leaveHistory,
		// History is the record, not work-to-do — deliberately NOT in `total`,
		// which drives the "needs your attention" count.
		outletLinkRequests: outletLinks.links,
		pendingMembers,
		// A venue waiting to be let in IS work awaiting this agency, so it belongs
		// in the same total the Today tile reads. Leaving it out is why that tile
		// said "Nothing awaiting approval" while the Approvals page had a venue
		// sitting in its queue — the identical drift this hook was created to end.
		total:
			signups.length +
			linkRequests.length +
			cutlostRequests.length +
			leaveRequests.length +
			outletLinks.links.length +
			pendingMembers,
		isLoading: liveCutlost.isLoading || leaveQuery.isLoading,
		leaveIsLoading: leaveQuery.isLoading,
		leaveHistoryIsLoading: leaveHistoryQuery.isLoading,
		backend,
		cutlost: liveCutlost,
	};
}
