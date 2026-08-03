import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

// 'pos_integration_quote' = outlet "Integrate with POS → Request admin quote";
// 'custom_renegotiation' = agency Custom (151+ PV) "Renegotiate Price".
export type AdminRequestType =
	| "pos_integration_quote"
	| "custom_renegotiation"
	| "plan_change"
	| "contact"
	| "other";
// Plan-change lifecycle: outlet switches sit as 'pending' until the admin marks
// them 'approved' or 'declined'; agency switches are auto-applied and logged as
// 'direct'. Other request types use pending → contacted → resolved.
export type AdminRequestStatus =
	| "pending"
	| "contacted"
	| "resolved"
	| "declined"
	| "direct"
	| "approved";
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
	requestedPlanId: string | null;
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
	/**
	 * Negotiated requests only (outlet POS add-on, agency Custom tier): the price
	 * this subscriber is on today, so a re-quote or a cancellation can be read
	 * against the figure it replaces or ends. Null for a first-time request, and
	 * for a catalog placeholder of zero. Computed server-side from the ledger.
	 */
	previousNegotiatedAmount?: string | null;
}

export interface AdminRequestsQueryParams {
	type?: AdminRequestType;
	/** Whitelist of types — serialized as a comma list into ?type=. */
	types?: AdminRequestType[];
	/** Exclude a single type from the results (e.g. plan_change). */
	excludeType?: AdminRequestType;
	status?: AdminRequestStatus;
	subscriberType?: SubscriberType;
	dates?: string;
	page?: number;
	pageSize?: number;
	/** One row per subscriber — the newest request only (Plan Change page). */
	latestPerSubscriber?: boolean;
	/** Case-insensitive partial match on the outlet/agency name. */
	search?: string;
	/**
	 * Split the two inboxes: "only" = everything touching the POS add-on or the
	 * Custom tier (Plan Request), "exclude" = ordinary plan-to-plan switches
	 * (Plan Change).
	 */
	negotiated?: "only" | "exclude";
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
		type: params.types?.length ? params.types.join(",") : params.type,
		excludeType: params.excludeType,
		status: params.status,
		subscriberType: params.subscriberType,
		dates: params.dates,
		page: params.page,
		pageSize: params.pageSize,
		latestPerSubscriber: params.latestPerSubscriber ? "true" : undefined,
		search: params.search,
		negotiated: params.negotiated,
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
	quotedAmount?: number | null;
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

export interface CreateAdminRequestInput {
	type: AdminRequestType;
	subscriberType?: SubscriberType | null;
	/** Must be a real uuid or omitted — the backend rejects non-uuid ids. */
	subscriberId?: string | null;
	subscriberName: string;
	contactName?: string | null;
	contactEmail?: string | null;
	contactPhone?: string | null;
	currentPlanId?: string | null;
	requestedPlanId?: string | null;
	message?: string | null;
}

export async function createAdminRequest(
	input: CreateAdminRequestInput,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: AdminRequest }> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: AdminRequest;
	}>("/admin-request", input);
	return response.data;
}

/**
 * The signed-in venue's/agency's own outstanding plan change, or null.
 *
 * Scoped server-side from the session — there is no id to pass. Lets the
 * subscriber's own screen keep showing "awaiting admin" across a refresh, which
 * is what stops it filing the same switch twice.
 */
export async function fetchMyPlanChange(
	onRefreshFail: () => void,
): Promise<AdminRequest | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: AdminRequest | null;
	}>("/admin-request/mine/plan-change");
	return response.data.data ?? null;
}

/** The signed-in subscriber's own outstanding POS-integration quote, or null. */
export async function fetchMyPosQuote(
	onRefreshFail: () => void,
): Promise<AdminRequest | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: AdminRequest | null;
	}>("/admin-request/mine/pos-quote");
	return response.data.data ?? null;
}

/**
 * The signed-in agency's own outstanding Custom price request, or null — the
 * counterpart to the POS quote above. Covers joining Custom, re-agreeing its
 * price and leaving it, since all three are filed as `custom_renegotiation`.
 */
export async function fetchMyCustomQuote(
	onRefreshFail: () => void,
): Promise<AdminRequest | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: AdminRequest | null;
	}>("/admin-request/mine/custom-quote");
	return response.data.data ?? null;
}

export async function fetchPendingCount(
	onRefreshFail: () => void,
	params: { type?: AdminRequestType; excludeType?: AdminRequestType } = {},
): Promise<{ pending: number }> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		type: params.type,
		excludeType: params.excludeType,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: { pending: number };
	}>(`/admin-request/pending-count${queryString}`);
	return response.data.data ?? { pending: 0 };
}

// Approve an outlet plan change. Pass the to-plan price so it is stamped as the
// price the subscriber pays from now on.
export async function approvePlanChange(
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
	}>(`/admin-request/${id}/approve`, body);
	return response.data;
}

// Decline an outlet plan change — the subscriber stays on the from-plan.
export async function declinePlanChange(
	id: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: AdminRequest }> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: AdminRequest;
	}>(`/admin-request/${id}/decline`);
	return response.data;
}
