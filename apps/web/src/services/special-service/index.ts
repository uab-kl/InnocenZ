import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type SpecialServiceCategory =
	| "transportation"
	| "delivery"
	| "wardrobe"
	| "makeup"
	| "vip_escort"
	| "uniform"
	| "emergency_cover"
	| "training"
	| "others";
export type SpecialServiceStatus =
	| "open"
	| "assigned"
	| "in_progress"
	| "completed"
	| "cancelled";
export type SpecialServiceInitiatedBy = "outlet" | "agency";
export type SpecialServiceAdminAccepted =
	| "n_a"
	| "pending"
	| "accepted"
	| "declined";

export interface SpecialServicePagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface SpecialService {
	id: string;
	outletId: string | null;
	outletName: string;
	title: string;
	category: SpecialServiceCategory;
	description: string | null;
	budget: string | null;
	currency: string;
	status: SpecialServiceStatus;
	initiatedBy: SpecialServiceInitiatedBy;
	adminAccepted: SpecialServiceAdminAccepted;
	postingAgencyId: string | null;
	postingAgencyName: string | null;
	assignedAgencyId: string | null;
	assignedAgencyName: string | null;
	scheduledFor: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface SpecialServicesQueryParams {
	status?: SpecialServiceStatus;
	category?: SpecialServiceCategory;
	outletId?: string;
	initiatedBy?: SpecialServiceInitiatedBy;
	adminAccepted?: SpecialServiceAdminAccepted;
	page?: number;
	pageSize?: number;
}

export interface SpecialServicesApiResponse {
	success: boolean;
	message: string;
	pagination: SpecialServicePagination;
	data: SpecialService[];
}

export interface SpecialServiceSummaryResponse {
	success: boolean;
	message: string;
	data: Record<SpecialServiceStatus, number>;
	total: number;
}

export interface SpecialServiceApiResponse {
	success: boolean;
	message: string;
	data: SpecialService;
}

export async function fetchSpecialServices(
	params: SpecialServicesQueryParams = {},
	onRefreshFail: () => void,
): Promise<SpecialServicesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		status: params.status,
		category: params.category,
		outletId: params.outletId,
		initiatedBy: params.initiatedBy,
		adminAccepted: params.adminAccepted,
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<SpecialServicesApiResponse>(
		`/special-service${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchAdminPendingJobs(
	params: { page?: number; pageSize?: number } = {},
	onRefreshFail: () => void,
): Promise<SpecialServicesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<SpecialServicesApiResponse>(
		`/special-service/admin/pending${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchSpecialServiceSummary(
	onRefreshFail: () => void,
): Promise<SpecialServiceSummaryResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<SpecialServiceSummaryResponse>(
		"/special-service/summary",
	);
	return response.data;
}

export async function updateSpecialServiceStatus(
	id: string,
	status: SpecialServiceStatus,
	onRefreshFail: () => void,
): Promise<SpecialServiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<SpecialServiceApiResponse>(
		`/special-service/${id}/status`,
		{ status },
	);
	return response.data;
}

export async function adminApproveJob(
	id: string,
	onRefreshFail: () => void,
): Promise<SpecialServiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<SpecialServiceApiResponse>(
		`/special-service/${id}/admin-approve`,
	);
	return response.data;
}

export async function adminDeclineJob(
	id: string,
	onRefreshFail: () => void,
): Promise<SpecialServiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<SpecialServiceApiResponse>(
		`/special-service/${id}/admin-decline`,
	);
	return response.data;
}

export interface UpdateSpecialServiceInput {
	title?: string;
	description?: string | null;
	category?: SpecialServiceCategory;
	outletName?: string;
	postingAgencyName?: string | null;
	initiatedBy?: SpecialServiceInitiatedBy;
	budget?: number | null;
	scheduledFor?: string | null;
}

export async function updateSpecialService(
	id: string,
	input: UpdateSpecialServiceInput,
	onRefreshFail: () => void,
): Promise<SpecialServiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<SpecialServiceApiResponse>(
		`/special-service/${id}`,
		input,
	);
	return response.data;
}
