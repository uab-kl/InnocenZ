import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	AgenciesApiResponse,
	AgenciesQueryParams,
	AgencyApiResponse,
	AgencyMembersApiResponse,
	AgencyMembersQueryParams,
	AgencyMembershipsApiResponse,
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
	const response = await client.get<AgenciesApiResponse>(`/agency${queryString}`);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function approveAgency(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<AgencyApiResponse>(`/agency/${id}/approve`);
	return response.data;
}

export async function suspendAgency(
	id: string,
	onRefreshFail: () => void,
): Promise<AgencyApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<AgencyApiResponse>(`/agency/${id}/suspend`);
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
