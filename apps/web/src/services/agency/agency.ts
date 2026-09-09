import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	AgenciesApiResponse,
	AgenciesQueryParams,
	AgencyApiResponse,
	AgencyMemberApiResponse,
	AgencyMembersApiResponse,
	AgencyMembershipsApiResponse,
	AgencyMembersQueryParams,
	AgencyPr,
	BroadcastToPrsApiResponse,
	PrAgencyLink,
} from "./types";

export async function fetchAgencies(
	params: AgenciesQueryParams = {},
	onRefreshFail: () => void,
): Promise<AgenciesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		name: params.name,
		agencyCode: params.agencyCode,
		status: params.status,
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<AgenciesApiResponse>(
		`/agency${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchAgencyById(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<AgencyApiResponse>(`/agency/${id}`);
	return response.data;
}

/**
 * Owner-only edit of the agency's own record (`PUT /agency/:id`).
 *
 * `status` is deliberately absent from the payload type: it is the admin
 * approve/suspend lane, and the server refuses it outright from a non-admin
 * caller rather than dropping it silently.
 */
export async function updateAgency(
	id: string,
	payload: {
		name?: string;
		ssmNo?: string;
		contactName?: string;
		contactEmail?: string;
		contactPhone?: string;
		addressLine1?: string;
		addressLine2?: string;
		city?: string;
		postcode?: string;
		state?: string;
		country?: string;
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
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<AgencyApiResponse>(
		`/agency/${id}`,
		payload,
	);
	return response.data;
}

/** The un-cropped original behind an agency's logo, plus where the frame was left. */
export type AgencyLogoSource = {
	dataUrl: string;
	fileName: string;
	contentType: string;
	state: { zoom: number; fx: number; fy: number } | null;
	/** True when no original was stored: this is the already-cropped image. */
	fallback: boolean;
};

/**
 * Fetch the stored original so "Adjust crop" works after a reload — the outlet
 * function's twin. Goes through the API because the public R2 host sends no
 * CORS header, so the browser can neither fetch the original nor export a
 * canvas drawn from it. `null` means no stored source; the caller hides Adjust.
 */
export async function fetchAgencyLogoSource(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyLogoSource | null> {
	try {
		const client = getClient(onRefreshFail);
		const response = await client.get<{ data: AgencyLogoSource | null }>(
			`/agency/${id}/logo-source`,
		);
		return response.data?.data ?? null;
	} catch {
		return null;
	}
}

export async function approveAgency(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<AgencyApiResponse>(
		`/agency/${id}/approve`,
	);
	return response.data;
}

/** Set the agency `inactive`: every account in it is refused at login and signed out. */
export async function deactivateAgency(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<AgencyApiResponse>(
		`/agency/${id}/deactivate`,
	);
	return response.data;
}

/**
 * Send one free-text notice to PRs on this agency's roster.
 *
 * `prIds` are USER ids — `AgencyManagedPR.id`, which the backend list path
 * already sets to `user_id` (pr.controller maps `id: row.userId`). The server
 * refuses the whole request unless every one of them is an approved member of
 * `agencyId`, so a partial send is not a state this can return.
 */
export async function broadcastToPrs(
	agencyId: string,
	input: { prIds: string[]; title: string; body: string },
	onRefreshFail: () => void,
): Promise<BroadcastToPrsApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<BroadcastToPrsApiResponse>(
		`/agency/${agencyId}/broadcast`,
		input,
	);
	return response.data;
}

export async function fetchAgencyMembers(
	agencyId: string,
	params: AgencyMembersQueryParams = {},
	onRefreshFail: () => void,
): Promise<AgencyMembersApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		subRole: params.subRole,
		status: params.status,
		search: params.search,
	});
	const response = await client.get<AgencyMembersApiResponse>(
		`/agency/${agencyId}/members${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/** Portal RBAC roles for the invite dropdown (owner-scoped; not admin /rbac). */
export async function fetchAgencyInviteRoles(
	agencyId: string,
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
	}>(`/agency/${agencyId}/invite-roles`);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/**
 * Invite an EXISTING user by email (`POST /agency/:id/members`).
 * Creates an `agency_user` row as `pending` and emails an accept link.
 * Membership becomes `active` only after they accept.
 */
export async function addAgencyMember(
	agencyId: string,
	payload:
		| { email: string; subRole?: string; roleId?: string }
		| { userId: string; subRole?: string; roleId?: string },
	onRefreshFail: () => void,
): Promise<AgencyMemberApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<AgencyMemberApiResponse>(
		`/agency/${agencyId}/members`,
		payload,
	);
	return response.data;
}

/**
 * Change a member's sub-role or status.
 *
 * The server refuses (409) anything that would leave the agency with no active
 * owner, and 404s a `memberId` belonging to a different agency.
 */
export async function updateAgencyMember(
	agencyId: string,
	memberId: string,
	payload: { subRole?: string; status?: string },
	onRefreshFail: () => void,
): Promise<AgencyMemberApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<AgencyMemberApiResponse>(
		`/agency/${agencyId}/members/${memberId}`,
		payload,
	);
	return response.data;
}

/** Remove a member. Refused (409) if they are the last active owner. */
export async function removeAgencyMember(
	agencyId: string,
	memberId: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{ success: boolean; message: string }>(
		`/agency/${agencyId}/members/${memberId}`,
	);
	return response.data;
}

/**
 * All active agency memberships for a single user, across every sub-role. Used
 * to resolve the signed-in operator's own agency + role at session start.
 * Unlike fetchAgencyMembershipsByUsers (which defaults to the `pr` sub-role for
 * roster lookups), this omits the sub-role filter so owner/finance rows return.
 */
export async function fetchAgencyMembershipsForUser(
	userId: string,
	onRefreshFail: () => void,
): Promise<AgencyMembershipsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		userIds: userId,
		// Without this the endpoint falls back to its `pr` default and an
		// operator's own owner/finance row is filtered out.
		subRole: "all",
		status: "active",
	});
	const response = await client.get<AgencyMembershipsApiResponse>(
		`/agency/memberships${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/**
 * Which agencies each PR user account is under, read from agency_pr. Replaces
 * the old `fetchAgencyMembershipsByUsers(..., { subRole: "pr" })` — agency_user
 * holds only portal operators now.
 */
export async function fetchPrAgencyLinks(
	userIds: string[],
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: PrAgencyLink[] }> {
	if (userIds.length === 0) {
		return { success: true, message: "OK", data: [] };
	}

	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({ userIds: userIds.join(",") });
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PrAgencyLink[] | null;
	}>(`/agency/pr-links${queryString}`);

	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/** One agency's PR roster, read from agency_pr. */
export async function fetchAgencyPrs(
	agencyId: string,
	params: { approveStatus?: string; search?: string } = {},
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: AgencyPr[] }> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		approveStatus: params.approveStatus,
		search: params.search,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: AgencyPr[] | null;
	}>(`/agency/${agencyId}/prs${queryString}`);

	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/** Approvals — accept / decline membership by user_id (agency_pr). */
export async function setAgencyPrApproval(
	agencyId: string,
	userId: string,
	body: { approveStatus: "approved" | "rejected"; rejectReason?: string },
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{ success: boolean; message: string }>(
		`/agency/${agencyId}/prs/${userId}/approval`,
		body,
	);
	return {
		success: response.data.success,
		message: response.data.message,
	};
}

export async function fetchAgencyMembershipsByUsers(
	userIds: string[],
	onRefreshFail: () => void,
	options: { subRole?: string; status?: string } = {},
): Promise<AgencyMembershipsApiResponse> {
	if (userIds.length === 0) {
		return { success: true, message: "OK", data: [] };
	}

	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		userIds: userIds.join(","),
		subRole: options.subRole,
		status: options.status ?? "active",
	});
	const response = await client.get<AgencyMembershipsApiResponse>(
		`/agency/memberships${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}
