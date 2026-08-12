import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * The subscription billing ledger — one row per CHARGE.
 *
 * Distinct from `services/member-subscription`, which is one row per
 * SUBSCRIPTION and carries no payment state at all. Trying to read payment out
 * of that one is what every "paid history" attempt on these screens ran into.
 */
export type SubscriptionInvoiceStatus = "unpaid" | "paid";
export type SubscriberType = "outlet" | "agency";

export interface SubscriptionInvoice {
	id: string;
	memberSubscriptionId: string;
	/** Calendar days, YYYY-MM-DD — a billing period has no time of day. */
	periodStart: string;
	periodEnd: string;
	/** numeric(12,2) over the wire, so a string. */
	amount: string;
	currency: string;
	status: SubscriptionInvoiceStatus;
	paidAt: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	// Joined from member_subscription — not stored on the invoice.
	subscriberType: SubscriberType;
	subscriberId: string;
	subscriberName: string;
	planName: string;
	/** 'weekly' for agencies, 'monthly' for outlets. */
	billingCycle: string;
}

export interface SubscriptionInvoicePagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface SubscriptionInvoiceQueryParams {
	page?: number;
	pageSize?: number;
	subscriberType?: SubscriberType;
	subscriberId?: string;
	status?: SubscriptionInvoiceStatus;
	search?: string;
	/** Exact period-start days, comma-joined by the caller's date filter. */
	dates?: string;
	from?: string;
	to?: string;
}

export interface SubscriptionInvoicesApiResponse {
	success: boolean;
	message: string;
	data: SubscriptionInvoice[];
	pagination?: SubscriptionInvoicePagination;
}

export interface SubscriptionInvoiceApiResponse {
	success: boolean;
	message: string;
	data: SubscriptionInvoice | null;
}

export async function fetchSubscriptionInvoices(
	params: SubscriptionInvoiceQueryParams = {},
	onRefreshFail: () => void,
): Promise<SubscriptionInvoicesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		page: params.page,
		pageSize: params.pageSize,
		subscriberType: params.subscriberType,
		subscriberId: params.subscriberId,
		status: params.status,
		search: params.search,
		dates: params.dates,
		from: params.from,
		to: params.to,
	});
	const response = await client.get<SubscriptionInvoicesApiResponse>(
		`/subscription-invoice${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

/**
 * Mark a period paid, or take that back. Admin-only server-side — the payer
 * cannot declare its own bill settled.
 */
export async function setSubscriptionInvoiceStatus(
	id: string,
	status: SubscriptionInvoiceStatus,
	onRefreshFail: () => void,
): Promise<SubscriptionInvoiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<SubscriptionInvoiceApiResponse>(
		`/subscription-invoice/${id}`,
		{ status },
	);
	return response.data;
}

/**
 * Open any billing period that has started and has no row yet. Idempotent — the
 * server refuses to bill a period twice — so pressing it again is a no-op.
 */
export async function generateSubscriptionInvoices(
	onRefreshFail: () => void,
): Promise<{
	success: boolean;
	message: string;
	data: { scanned: number; created: number } | null;
}> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: { scanned: number; created: number } | null;
	}>("/subscription-invoice/generate", {});
	return response.data;
}
