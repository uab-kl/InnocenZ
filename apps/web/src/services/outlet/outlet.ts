import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	OutletApiResponse,
	OutletGeocodeApiResponse,
	OutletMembersApiResponse,
	OutletMembershipsApiResponse,
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

/**
 * All active outlet memberships for a single user, across every sub-role. Used
 * to resolve the signed-in operator's own outlet + role at session start
 * (mirrors fetchAgencyMembershipsForUser).
 */
export async function fetchOutletMembershipsForUser(
	userId: string,
	onRefreshFail: () => void,
): Promise<OutletMembershipsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		userIds: userId,
		status: "active",
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

/**
 * Address -> candidate pins for this outlet's SAVED address. Read-only by
 * design: the operator picks a candidate and commits it with
 * saveOutletGeoFence below, so the only code path that can switch the
 * check-in fence on for a venue is the one a human confirms.
 */
export async function geocodeOutletAddress(
	id: string,
	onRefreshFail: () => void,
): Promise<OutletGeocodeApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<OutletGeocodeApiResponse>(
		`/outlet/${id}/geocode`,
	);
	return response.data;
}

/**
 * Save the venue pin — THE fence master-switch. The moment this succeeds,
 * every PR check-in at this outlet is refused server-side outside
 * geoFenceRadius metres (HTTP 422; see backend check-in-geofence.ts).
 */
export async function saveOutletGeoFence(
	id: string,
	pin: { lat: number; lng: number; geoFenceRadius?: number },
	onRefreshFail: () => void,
): Promise<OutletApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<OutletApiResponse>(
		`/outlet/${id}/geo-fence`,
		pin,
	);
	return response.data;
}
