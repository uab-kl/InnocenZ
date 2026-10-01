import type { AgencyPrApproveStatus } from "@/services/agency/types";
import type { PrAgencyRef } from "./types";

/**
 * The membership states in which a PR is ON an agency's roster today:
 * accepted, or asked to leave and still waiting for the agency's answer.
 * `pending` is an application, `rejected` a refused one, `left` history.
 */
const ON_ROSTER: ReadonlySet<AgencyPrApproveStatus> = new Set([
	"approved",
	"leave_pending",
]);

/**
 * Is this link a CURRENT membership?
 *
 * `/agency/pr-links` returns every `agency_pr` row, departures included —
 * deliberately, they are her history — and the admin PR screens printed them
 * all as "Agency-Tied" / "Linked", so a PR who had left Delta still read as
 * working for it (28 Sep audit). A link with no state predates the field and
 * keeps the old reading rather than vanishing.
 */
export function isCurrentAgencyLink(
	link: Pick<PrAgencyRef, "approveStatus">,
): boolean {
	return link.approveStatus == null || ON_ROSTER.has(link.approveStatus);
}

/** Only the agencies she works for now, in the order given. */
export function currentAgencyLinks<
	T extends Pick<PrAgencyRef, "approveStatus">,
>(links: readonly T[]): T[] {
	return links.filter(isCurrentAgencyLink);
}
