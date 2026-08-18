import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import {
	fetchMyAgencyLinks,
	type OutletAgencyLink,
} from "@/services/agency-outlet";

/**
 * This venue's agency links, and whether it can post at all.
 *
 * ONE source for the Post Job picker, the Post button's disabled state and the
 * Today banner. They have to agree: a picker saying "no approved agency" beside
 * an enabled Post button invites the operator to compose an entire shift and
 * then collect a 400 from the server.
 *
 * Shares its query key with the picker, so a second consumer costs no extra
 * request.
 */
export interface OutletAgencyLinkState {
	/** Links in any state — Settings shows all of these. */
	links: OutletAgencyLink[];
	/** Only APPROVED links; a shift can be posted to exactly these. */
	approved: OutletAgencyLink[];
	/**
	 * True when this venue can post at all. A pending request is not permission,
	 * so a venue whose only link is awaiting a decision reads false here — the
	 * server refuses that post, and the UI should say so before the composing
	 * starts rather than after.
	 */
	canPost: boolean;
	/** At least one link exists but none approved yet — "waiting on them". */
	awaitingApproval: boolean;
	isLoading: boolean;
}

export function useOutletAgencyLinks(
	outletId?: string | null,
): OutletAgencyLinkState {
	const linksQuery = useQuery({
		queryKey: ["agency-outlet", "mine", outletId ?? "self"],
		queryFn: () => fetchMyAgencyLinks(kickToLogin, outletId ?? undefined),
		staleTime: 30_000,
	});

	const links = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);
	const approved = useMemo(
		() => links.filter((l) => l.approveStatus === "approved"),
		[links],
	);

	return {
		links,
		approved,
		canPost: approved.length > 0,
		// Deliberately excludes "rejected only": a venue whose requests were all
		// declined is not waiting on anybody, it needs to pick another agency.
		awaitingApproval:
			approved.length === 0 && links.some((l) => l.approveStatus === "pending"),
		isLoading: linksQuery.isLoading,
	};
}
