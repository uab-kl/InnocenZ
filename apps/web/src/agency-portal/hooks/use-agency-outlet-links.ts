import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { serverMessage } from "@agency-portal/hooks/use-org-members";
import { useStore } from "@agency-portal/lib/store";
import { kickToLogin } from "@/lib/auth/guards";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	type AgencyOutletApproveStatus,
	type AgencyOutletLink,
	decideOutletLink,
	fetchAgencyOutletLinks,
	unlinkOutlet,
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
	/**
	 * How many rows sit under EACH status, so the filter chips can carry counts
	 * the way the PR side's do. Undefined per key until known — a chip must not
	 * print "(0)" while the answer is still loading, which claims there is
	 * nothing there.
	 */
	counts: Partial<Record<AgencyOutletApproveStatus, number>>;
	isLoading: boolean;
	/** True until the pending count is known — the badge must not claim "0" yet. */
	pendingIsLoading: boolean;
	decide: (input: {
		outletId: string;
		approveStatus: "approved" | "rejected";
		rejectReason?: string;
	}) => Promise<void>;
	isDeciding: boolean;
	/**
	 * End a partnership this agency had accepted.
	 *
	 * Separate from `decide` because it is not a verdict on a request: rejecting
	 * says "we never agreed", ending says "we did, and it is over". They reach
	 * different endpoints and mean opposite things about the shared history, so
	 * folding them into one call would invite a screen to send the wrong one.
	 */
	end: (input: { outletId: string; reason?: string }) => Promise<void>;
	isEnding: boolean;
}

/**
 * A link carried over by migration 0123's backfill is a long-standing partner,
 * not a new request. Counting those as work-to-do would badge this tab over
 * settled relationships nobody needs to act on.
 *
 * ⚠️ `fromOnboarding` stops being true the moment the venue actually asks — the
 * server derives it from the EVENT LOG, not from `created_by` alone. It used to
 * read that origin column by itself, which never changes, so a backfilled
 * partnership that was ended and then genuinely re-requested came back flagged
 * as "not a real request" and was filtered out of this list AND out of the
 * count: the venue was shown "Awaiting approval" while the agency was shown
 * nothing to approve. Do not re-derive this flag client-side.
 */
function isRealRequest(link: AgencyOutletLink): boolean {
	return !link.fromOnboarding;
}

export function useAgencyOutletLinks(
	filter: AgencyOutletApproveStatus,
): AgencyOutletLinkQueue {
	const queryClient = useQueryClient();
	// The portal-wide toaster and dictionary — these three writes decide who this
	// agency does business with, and reported nothing at all before.
	const { t } = usePortalLocale();
	const toast = useStore((st) => st.toast);

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

	/**
	 * Every link, unfiltered, purely to count by status.
	 *
	 * The list query is filtered SERVER-side (`approveStatus: filter`), so it can
	 * only ever know the count of the status currently showing — and a chip row
	 * where three of four counts are unknowable is worse than none. One extra
	 * cached read answers all four. `pending` is counted through `isRealRequest`
	 * like everywhere else: an onboarding row is not a request anyone can act on.
	 */
	const countsQuery = useQuery({
		queryKey: ["agency-outlet", "links", "all"],
		queryFn: () => fetchAgencyOutletLinks(kickToLogin, {}),
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
		onSuccess: (_data, input) => {
			queryClient.invalidateQueries({ queryKey: ["agency-outlet", "links"] });
			// Approving adds the venue to this agency's outlet list, which is derived
			// from these rows — without this it would not appear until a reload and
			// would read as "the approval didn't take".
			queryClient.invalidateQueries({ queryKey: ["agency", "outlets"] });
			/*
			 * ⚠️ SAID OUT LOUD. Taking a venue on, or turning one away, is a
			 * decision about who this agency does business with — and it used to
			 * report nothing at all. The row left the filtered list, which is the
			 * same thing that happens when somebody ELSE decides it.
			 */
			toast(
				input.approveStatus === "approved"
					? t.approvals.decisionApproved
					: t.approvals.decisionDeclined,
				"success",
			);
		},
		onError: (error) =>
			toast(serverMessage(error, t.approvals.couldNotDecideLink), "warn"),
	});

	const endMutation = useMutation({
		mutationFn: (input: { outletId: string; reason?: string }) =>
			unlinkOutlet(input.outletId, kickToLogin, input.reason),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agency-outlet", "links"] });
			// The venue drops out of this agency's outlet list — unless it still has
			// shifts to finish, in which case 0127 deliberately keeps it there. Either
			// way the list changes, and a stale one would show a former partner as a
			// current one.
			queryClient.invalidateQueries({ queryKey: ["agency", "outlets"] });
			// Ending closes a working relationship the venue never asked about — it
			// finds out by discovering it can no longer post. The agency that did it
			// should at least be told it landed.
			toast(t.approvals.partnershipEnded, "success");
		},
		onError: (error) =>
			toast(serverMessage(error, t.approvals.couldNotEndPartnership), "warn"),
	});

	const links = useMemo(() => {
		const rows = listQuery.data ?? [];
		return filter === "pending" ? rows.filter(isRealRequest) : rows;
	}, [listQuery.data, filter]);

	const pendingCount = useMemo(
		() => (pendingQuery.data ?? []).filter(isRealRequest).length,
		[pendingQuery.data],
	);

	const counts = useMemo<
		Partial<Record<AgencyOutletApproveStatus, number>>
	>(() => {
		if (!countsQuery.data) return {};
		const out: Partial<Record<AgencyOutletApproveStatus, number>> = {};
		for (const link of countsQuery.data) {
			const key = link.approveStatus;
			if (key === "pending" && !isRealRequest(link)) continue;
			out[key] = (out[key] ?? 0) + 1;
		}
		// Statuses with no rows must read 0, not blank — the query HAS answered.
		for (const key of ["pending", "approved", "rejected", "ended"] as const) {
			out[key] = out[key] ?? 0;
		}
		return out;
	}, [countsQuery.data]);

	return {
		links,
		pendingCount,
		counts,
		isLoading: listQuery.isLoading,
		pendingIsLoading: pendingQuery.isLoading,
		decide: async (input) => {
			await decideMutation.mutateAsync(input);
		},
		isDeciding: decideMutation.isPending,
		end: async (input) => {
			await endMutation.mutateAsync(input);
		},
		isEnding: endMutation.isPending,
	};
}
