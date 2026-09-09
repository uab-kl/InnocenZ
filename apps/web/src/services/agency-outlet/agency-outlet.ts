import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	AgencyDirectoryApiResponse,
	AgencyDirectoryEntry,
	AgencyOutletApproveStatus,
	AgencyOutletLink,
	AgencyOutletLinkEvent,
	AgencyOutletLinkEventsApiResponse,
	AgencyOutletLinksApiResponse,
	OutletAgencyLink,
	OutletAgencyLinksApiResponse,
} from "./types";

/**
 * Agency ↔ outlet linking (`agency_outlet`, migration 0123).
 *
 * Two lanes, and neither takes an org id: the backend derives the caller's
 * outlet or agency from the session. `/mine` is the venue's view of its
 * agencies; `/links` is the agency's view of its venues.
 */

/** Outlet Settings — every agency this venue is linked to, in any state. */
export async function fetchMyAgencyLinks(
	onRefreshFail: () => void,
	outletId?: string,
): Promise<OutletAgencyLink[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({ outletId });
	const response = await client.get<OutletAgencyLinksApiResponse>(
		`/agency-outlet/mine${queryString}`,
	);
	return response.data.data ?? [];
}

/**
 * Outlet Settings — set the venue's agency list.
 *
 * `agencyIds` is the WHOLE desired list, not a delta: an omitted id unlinks.
 * Agencies already approved keep that status, so saving this screen never
 * pushes an existing partner back into the approval queue.
 */
export async function saveMyAgencyLinks(
	agencyIds: string[],
	onRefreshFail: () => void,
	outletId?: string,
): Promise<OutletAgencyLink[]> {
	const client = getClient(onRefreshFail);
	const response = await client.put<OutletAgencyLinksApiResponse>(
		"/agency-outlet/mine",
		{ agencyIds, outletId },
	);
	return response.data.data ?? [];
}

/** Outlet-Linking tab — venues linked to, or asking to link to, my agency. */
export async function fetchAgencyOutletLinks(
	onRefreshFail: () => void,
	params: { approveStatus?: AgencyOutletApproveStatus; search?: string } = {},
): Promise<AgencyOutletLink[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		approveStatus: params.approveStatus,
		search: params.search,
	});
	const response = await client.get<AgencyOutletLinksApiResponse>(
		`/agency-outlet/links${queryString}`,
	);
	return response.data.data ?? [];
}

/** Outlet-Linking tab — accept or decline one venue's request. */
export async function decideOutletLink(
	outletId: string,
	approveStatus: Extract<AgencyOutletApproveStatus, "approved" | "rejected">,
	onRefreshFail: () => void,
	rejectReason?: string,
): Promise<void> {
	const client = getClient(onRefreshFail);
	await client.patch(`/agency-outlet/links/${outletId}`, {
		approveStatus,
		rejectReason,
	});
}

/**
 * Agency ends a partnership it had accepted.
 *
 * ENDS the link rather than deleting it (0127). Shifts already posted are
 * untouched, and this agency keeps sight of the venue until the last of them
 * has passed — the venue simply cannot send it new work.
 *
 * DELETE by verb because from the caller's side this is "remove my link"; the
 * server decides that honouring it means ending, not erasing. `reason` is
 * optional and lands on the event, never on the link row.
 */
export async function unlinkOutlet(
	outletId: string,
	onRefreshFail: () => void,
	reason?: string,
): Promise<void> {
	const client = getClient(onRefreshFail);
	// Axios wants a DELETE body under `data`. Passing `{ reason }` as the second
	// argument would send it as the request CONFIG instead and drop it silently.
	await client.delete(`/agency-outlet/links/${outletId}`, {
		data: { reason },
	});
}

/**
 * One partnership's whole timeline, newest first.
 *
 * Agency lane only — the outlet has no screen for its own history yet, and an
 * endpoint with no caller is a gate nobody remembers to check.
 */
export async function fetchOutletLinkHistory(
	outletId: string,
	onRefreshFail: () => void,
): Promise<AgencyOutletLinkEvent[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<AgencyOutletLinkEventsApiResponse>(
		`/agency-outlet/links/${outletId}/history`,
	);
	return response.data.data ?? [];
}

/**
 * The agencies a venue may choose from — name and code only.
 *
 * NOT `fetchAgencies()`: `GET /agency` is admin/agency-gated because an outlet
 * must not enumerate full agency records. This is the narrow slice a picker
 * needs.
 */
export async function fetchAgencyDirectory(
	onRefreshFail: () => void,
): Promise<AgencyDirectoryEntry[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<AgencyDirectoryApiResponse>(
		"/agency-outlet/directory",
	);
	return response.data.data ?? [];
}

/**
 * ADMIN — every agency one named venue is linked to.
 *
 * Distinct from `fetchMyAgencyLinks`, which answers "my venue" from the
 * caller's own outlet memberships and so is useless to an admin, who has none.
 */
export async function fetchOutletAgencyLinks(
	outletId: string,
	onRefreshFail: () => void,
): Promise<OutletAgencyLink[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<OutletAgencyLinksApiResponse>(
		`/agency-outlet/outlet/${outletId}`,
	);
	return response.data.data ?? [];
}

/**
 * ADMIN — every venue one named agency is linked to.
 *
 * The mirror of `fetchOutletAgencyLinks`, and distinct from
 * `fetchAgencyOutletLinks`, which answers "my agency" from the caller's own
 * memberships and so is useless to an admin, who has none.
 */
export async function fetchAgencyOutletLinksById(
	agencyId: string,
	onRefreshFail: () => void,
): Promise<AgencyOutletLink[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<AgencyOutletLinksApiResponse>(
		`/agency-outlet/agency/${agencyId}`,
	);
	return response.data.data ?? [];
}
