import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
// The team-member query shape is identical on both portals and is declared
// once, on the agency side, rather than kept in step in two files.
import type { TeamMembersQueryParams } from "@/services/agency";
import type {
	GeocodeCandidatesApiResponse,
	GeoFencePayload,
	OutletApiResponse,
	OutletGeocodeApiResponse,
	OutletMemberApiResponse,
	OutletMembersApiResponse,
	OutletMembershipsApiResponse,
	OutletsApiResponse,
	OutletsQueryParams,
	OutletTeamMembersApiResponse,
} from "./types";

export async function fetchOutlets(
	params: OutletsQueryParams = {},
	onRefreshFail: () => void,
): Promise<OutletsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		name: params.name,
		status: params.status,
		linkedToAgencyId: params.linkedToAgencyId,
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<OutletsApiResponse>(
		`/outlet${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchOutletById(
	id: string,
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<OutletApiResponse>(`/outlet/${id}`);
	return response.data;
}

/**
 * Owner-only edit of the venue's own record (`PUT /outlet/:id`).
 *
 * `status` is absent from the payload type: it is the admin approve/suspend
 * lane, and the server refuses it from a non-admin caller rather than dropping
 * it silently. `lat`/`lng` are absent too — moving a pin is
 * `PATCH /outlet/:id/geo-fence`, deliberately its own endpoint because saving a
 * pin is what switches hard geofencing on for that venue.
 */
export async function updateOutlet(
	id: string,
	payload: {
		name?: string;
		addressLine1?: string;
		addressLine2?: string;
		city?: string;
		postcode?: string;
		state?: string;
		country?: string;
		ssmNo?: string;
		businessLicense?: string;
		logoBase64?: string;
		logoFileName?: string;
		logoContentType?: string;
		/** The un-cropped ORIGINAL and its framing, stored beside the logo so
		 * "Adjust crop" survives a reload. */
		logoSourceDataUrl?: string;
		logoCropState?: { zoom: number; fx: number; fy: number };
		clearLogo?: boolean;
	},
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<OutletApiResponse>(
		`/outlet/${id}`,
		payload,
	);
	return response.data;
}

/** The un-cropped original behind a venue's logo, plus where the frame was left. */
export type LogoSource = {
	dataUrl: string;
	fileName: string;
	contentType: string;
	state: { zoom: number; fx: number; fy: number } | null;
	/** True when no original was stored: this is the already-cropped image. */
	fallback: boolean;
};

/**
 * Fetch the stored original so "Adjust crop" works after a reload.
 *
 * Goes through the API rather than the public R2 URL because that host sends no
 * CORS header: the browser cannot `fetch` it, and an image loaded from it taints
 * the canvas the crop sheet exports from. `null` is the ordinary answer for a
 * logo uploaded before this shipped — the caller then hides Adjust.
 */
export async function fetchOutletLogoSource(
	id: string,
	onRefreshFail: () => void,
): Promise<LogoSource | null> {
	try {
		const client = getClient(onRefreshFail);
		const response = await client.get<{ data: LogoSource | null }>(
			`/outlet/${id}/logo-source`,
		);
		return response.data?.data ?? null;
	} catch {
		// A missing or forbidden source must never break Settings; it only means
		// no Adjust, which is exactly how this screen behaved before.
		return null;
	}
}

export async function approveOutlet(
	id: string,
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<OutletApiResponse>(
		`/outlet/${id}/approve`,
	);
	return response.data;
}

/** Set the outlet `inactive`: every account in it is refused at login and signed out. */
export async function deactivateOutlet(
	id: string,
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<OutletApiResponse>(
		`/outlet/${id}/deactivate`,
	);
	return response.data;
}

/**
 * Address -> candidate pins, built from the outlet's OWN stored address columns.
 * Read-only: nothing is saved until the operator confirms one through
 * setOutletGeoFence.
 */
export async function geocodeOutletAddress(
	outletId: string,
	onRefreshFail: () => void,
): Promise<OutletGeocodeApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<OutletGeocodeApiResponse>(
		`/outlet/${outletId}/geocode`,
	);
	return response.data;
}

/** Same lookup for a typed address, when the saved one is wrong or missing. */
export async function geocodeOutletFreeText(
	address: string,
	onRefreshFail: () => void,
): Promise<GeocodeCandidatesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({ address });
	const response = await client.get<GeocodeCandidatesApiResponse>(
		`/outlet/geocode${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/**
 * Commits the pin. This is the ONLY call that switches hard geofencing on for a
 * venue — once lat/lng exist, every PR check-in there is distance-checked — so
 * it stays a deliberate, human-confirmed action. Owner sub-role only, enforced
 * server-side by outletOwnerOnly.
 */
export async function setOutletGeoFence(
	outletId: string,
	payload: GeoFencePayload,
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<OutletApiResponse>(
		`/outlet/${outletId}/geo-fence`,
		payload,
	);
	return response.data;
}

/**
 * Drops the pin — the exact inverse of setOutletGeoFence, and the only way to
 * switch attendance verification back OFF for a venue. Every check-in there is
 * accepted unmeasured again afterwards, so the UI confirms before calling it.
 * Owner sub-role only, enforced server-side by outletOwnerOnly.
 */
export async function clearOutletGeoFence(
	outletId: string,
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<OutletApiResponse>(
		`/outlet/${outletId}/geo-fence`,
	);
	return response.data;
}

/**
 * Outlet memberships for a single user, across every sub-role. Used to resolve
 * the signed-in operator's own outlet + role at session start, and by the admin
 * member page to list every venue one person belongs to (mirrors
 * fetchAgencyMembershipsForUser, including the admin-unfiltered rule).
 *
 * `status` defaults to `active` — a switched-off membership must not resolve a
 * session. Pass `"all"` when auditing rather than authenticating.
 */
export async function fetchOutletMembershipsForUser(
	userId: string,
	onRefreshFail: () => void,
	options: { status?: "active" | "all" } = {},
): Promise<OutletMembershipsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		userIds: userId,
		status: options.status ?? "active",
	});
	const response = await client.get<OutletMembershipsApiResponse>(
		`/outlet/memberships${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/**
 * Invite an EXISTING user by email (`POST /outlet/:id/members`).
 * Creates an `outlet_user` row as `pending` and emails an accept link.
 * Membership becomes `active` only after they accept.
 */
export async function addOutletMember(
	outletId: string,
	payload:
		| { email: string; subRole?: string; roleId?: string }
		| { userId: string; subRole?: string; roleId?: string },
	onRefreshFail: () => void,
): Promise<OutletMemberApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<OutletMemberApiResponse>(
		`/outlet/${outletId}/members`,
		payload,
	);
	return response.data;
}

/**
 * Change a member's sub-role or status. The server refuses (409) anything that
 * would leave the venue with no active owner, and 404s a `memberId` belonging to
 * a different venue.
 */
export async function updateOutletMember(
	outletId: string,
	memberId: string,
	payload: { subRole?: string; status?: string },
	onRefreshFail: () => void,
): Promise<OutletMemberApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<OutletMemberApiResponse>(
		`/outlet/${outletId}/members/${memberId}`,
		payload,
	);
	return response.data;
}

/** Remove a member. Refused (409) if they are the last active owner. */
export async function removeOutletMember(
	outletId: string,
	memberId: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{ success: boolean; message: string }>(
		`/outlet/${outletId}/members/${memberId}`,
	);
	return response.data;
}

/**
 * ADMIN — every venue operator on the platform, paginated. The twin of
 * `fetchAgencyTeamMembers`; `fetchOutletMembers` is scoped to one venue.
 */
export async function fetchOutletTeamMembers(
	params: TeamMembersQueryParams,
	onRefreshFail: () => void,
): Promise<OutletTeamMembersApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		page: params.page,
		pageSize: params.pageSize,
		search: params.search,
		status: params.status,
		// The server names it per portal; the screen speaks one word.
		outletId: params.orgId,
	});
	const response = await client.get<OutletTeamMembersApiResponse>(
		`/outlet/team-members${queryString}`,
	);
	return response.data;
}
export async function fetchOutletMembers(
	outletId: string,
	onRefreshFail: () => void,
): Promise<OutletMembersApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<OutletMembersApiResponse>(
		`/outlet/${outletId}/members`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/** Portal RBAC roles for the invite dropdown (owner-scoped; not admin /rbac). */
export async function fetchOutletInviteRoles(
	outletId: string,
	onRefreshFail: () => void,
): Promise<{
	success: boolean;
	message: string;
	data: Array<{
		id: string;
		roleName: string;
		portalId: string | null;
		portalCode: string;
		status: string;
	}>;
}> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: Array<{
			id: string;
			roleName: string;
			portalId: string | null;
			portalCode: string;
			status: string;
		}>;
	}>(`/outlet/${outletId}/invite-roles`);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

// The geocode and geo-fence calls live above: geocodeOutletAddress,
// geocodeOutletFreeText and setOutletGeoFence. A second pair of them arrived
// on the same merge under different names, hitting the identical two
// endpoints — the duplicate `geocodeOutletAddress` would not have compiled.
