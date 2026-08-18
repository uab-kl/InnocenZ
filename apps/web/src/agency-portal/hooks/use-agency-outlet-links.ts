import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import {
	type AgencyOutletApproveStatus,
	type AgencyOutletLink,
	decideOutletLink,
	fetchAgencyOutletLinks,
} from "@/services/agency-outlet";

/**
 * Venues linked to (or asking to link to) this agency — `agency_outlet`, 0123.
 *
 * ONE source for four surfaces that must agree: the Outlet-Linking tab's list,
 * its detail pane, the count on the tab itself, and the Today hub's "Pending
 * approvals" tile. Reading them separately is exactly how the Today tile and
 * the Approvals page drifted apart for the PR queue — see the note on
 * `useAgencyApprovalQueue`, which exists because of that bug.
 *
 * `pendingCount` is queried SEPARATELY from the filtered list on purpose: the
 * badge has to keep saying how much work is waiting even while the operator is
 * reading the "Declined" filter. On the common case (filter === "pending") both
 * resolve to the same react-query key, so it costs no extra request.
 */
export interface AgencyOutletLinkQueue {
	/** Rows for the CURRENT filter, ready to render. */
	links: AgencyOutletLink[];
	/** Rows genuinely awaiting a decision, whatever filter is showing. */
	pendingCount: number;
	isLoading: boolean;
	/** True until the pending count is known — the badge must not claim "0" yet. */
	pendingIsLoading: boolean;
	decide: (input: {
		outletId: string;
		approveStatus: "approved" | "rejected";
		rejectReason?: string;
	}) => Promise<void>;
	isDeciding: boolean;
}

/**
 * A link carried over by migration 0123's backfill is a long-standing partner,
 * not a new request. Counting those as work-to-do would badge this tab over
 * settled relationships nobody needs to act on.
 */
function isRealRequest(link: AgencyOutletLink): boolean {
	return !link.fromOnboarding;
}

export function useAgencyOutletLinks(
	filter: AgencyOutletApproveStatus,
): AgencyOutletLinkQueue {
	const queryClient = useQueryClient();

	const listQuery = useQuery({
		queryKey: ["agency-outlet", "links", filter],
		queryFn: () =>
			fetchAgencyOutletLinks(kickToLogin, { approveStatus: filter }),
		staleTime: 30_000,
	});

	// Same key the list uses when filter === "pending", so the two collapse into
	// a single cache entry rather than firing twice on the common case.
	const pendingQuery = useQuery({
		queryKey: ["agency-outlet", "links", "pending"],
		queryFn: () =>
			fetchAgencyOutletLinks(kickToLogin, { approveStatus: "pending" }),
		staleTime: 30_000,
	});

	const decideMutation = useMutation({
		mutationFn: (input: {
			outletId: string;
			approveStatus: "approved" | "rejected";
			rejectReason?: string;
		}) =>
			decideOutletLink(
				input.outletId,
				input.approveStatus,
				kickToLogin,
				input.rejectReason,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agency-outlet", "links"] });
			// Approving adds the venue to this agency's outlet list, which is derived
			// from these rows — without this it would not appear until a reload and
			// would read as "the approval didn't take".
			queryClient.invalidateQueries({ queryKey: ["agency", "outlets"] });
		},
	});

	const links = useMemo(() => {
		const rows = listQuery.data ?? [];
		return filter === "pending" ? rows.filter(isRealRequest) : rows;
	}, [listQuery.data, filter]);

	const pendingCount = useMemo(
		() => (pendingQuery.data ?? []).filter(isRealRequest).length,
		[pendingQuery.data],
	);

	return {
		links,
		pendingCount,
		isLoading: listQuery.isLoading,
		pendingIsLoading: pendingQuery.isLoading,
		decide: async (input) => {
			await decideMutation.mutateAsync(input);
		},
		isDeciding: decideMutation.isPending,
	};
}
