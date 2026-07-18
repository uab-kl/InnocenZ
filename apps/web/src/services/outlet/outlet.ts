import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	OutletApiResponse,
	OutletMembersApiResponse,
	OutletsApiResponse,
	OutletsQueryParams,
} from "./types";

export async function fetchOutlets(
	params: OutletsQueryParams = {},
	onRefreshFail: () => void,
): Promise<OutletsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		name: params.name,
		status: params.status,
		onboardedByAgencyId: params.onboardedByAgencyId,
		subscriptionId: params.subscriptionId,
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

export async function suspendOutlet(
	id: string,
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<OutletApiResponse>(
		`/outlet/${id}/suspend`,
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
