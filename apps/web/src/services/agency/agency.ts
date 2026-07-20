import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	AgenciesApiResponse,
	AgenciesQueryParams,
	AgencyApiResponse,
	AgencyMembersApiResponse,
	AgencyMembershipsApiResponse,
	AgencyMembersQueryParams,
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

export async function suspendAgency(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<AgencyApiResponse>(
		`/agency/${id}/suspend`,
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
		subRole: options.subRole ?? "pr",
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
