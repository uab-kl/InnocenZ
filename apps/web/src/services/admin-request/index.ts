import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type AdminRequestType =
	| "pos_integration_quote"
	| "plan_change"
	| "contact"
	| "other";
export type AdminRequestStatus = "pending" | "contacted" | "resolved";
export type SubscriberType = "outlet" | "agency";

export interface AdminRequestPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface AdminRequest {
	id: string;
	type: AdminRequestType;
	subscriberType: SubscriberType | null;
	subscriberId: string | null;
	subscriberName: string;
	contactName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	currentPlanId: string | null;
	message: string | null;
	remarks: string | null;
	status: AdminRequestStatus;
	quotedAmount: string | null;
	contactedAt: string | null;
	contactedBy: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface AdminRequestsQueryParams {
	type?: AdminRequestType;
	status?: AdminRequestStatus;
	subscriberType?: SubscriberType;
	page?: number;
	pageSize?: number;
}

export interface AdminRequestsApiResponse {
	success: boolean;
	message: string;
	pagination: AdminRequestPagination;
	data: AdminRequest[];
}

export interface NegotiatedRoleTotals {
	count: number;
	total: number;
}

export interface NegotiatedSummaryResponse {
	success: boolean;
	message: string;
	data: Array<{
		subscriberType: SubscriberType | null;
		count: number;
		total: number;
		average: number;
	}>;
	byRole: { outlet: NegotiatedRoleTotals; agency: NegotiatedRoleTotals };
	totals: { count: number; total: number };
}

export async function fetchAdminRequests(
	params: AdminRequestsQueryParams = {},
	onRefreshFail: () => void,
): Promise<AdminRequestsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		type: params.type,
		status: params.status,
		subscriberType: params.subscriberType,
		page: params.page,
		pageSize: params.pageSize,
	});

	const response = await client.get<AdminRequestsApiResponse>(
		`/admin-request${queryString}`,
	);

	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchNegotiatedSummary(
	onRefreshFail: () => void,
): Promise<NegotiatedSummaryResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<NegotiatedSummaryResponse>(
		"/admin-request/negotiated-summary",
	);
	return response.data;
}

export async function markRequestContacted(
	id: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: AdminRequest }> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: AdminRequest;
	}>(`/admin-request/${id}/contacted`);
	return response.data;
}

// Resolve a request, optionally recording the negotiated price for its plan/subscriber.
export async function resolveRequest(
	id: string,
	quotedAmount: number | undefined,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: AdminRequest }> {
	const client = getClient(onRefreshFail);
	const body = quotedAmount === undefined ? {} : { quotedAmount };
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: AdminRequest;
	}>(`/admin-request/${id}/resolve`, body);
	return response.data;
}

export interface UpdateAdminRequestInput {
	type?: AdminRequestType;
	subscriberType?: SubscriberType | null;
	subscriberName?: string;
	message?: string | null;
	remarks?: string | null;
}

export async function updateAdminRequest(
	id: string,
	input: UpdateAdminRequestInput,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: AdminRequest }> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: AdminRequest;
	}>(`/admin-request/${id}`, input);
	return response.data;
}

export async function fetchPendingCount(
	onRefreshFail: () => void,
): Promise<{ pending: number }> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: { pending: number };
	}>("/admin-request/pending-count");
	return response.data.data ?? { pending: 0 };
}
