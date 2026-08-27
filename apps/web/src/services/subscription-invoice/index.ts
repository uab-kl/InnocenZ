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
 * One org and everything it is billed — its plan, its Custom price and its POS
 * add-on together, every period, in one entry.
 *
 * `subscriberId` is the identity, never the name: a rename would otherwise
 * split one org across two cards, and two orgs sharing a name would merge.
 */
export interface SubscriptionInvoiceGroup {
	subscriberType: SubscriberType;
	subscriberId: string;
	subscriberName: string;
	/** Newest period first. Every lane the org holds, not just its plan. */
	invoices: SubscriptionInvoice[];
}

export interface SubscriptionInvoiceGroupsApiResponse {
	success: boolean;
	message: string;
	data: SubscriptionInvoiceGroup[];
	/** ⚠️ `totalCount` counts ORGS here, not invoices — the page lists orgs. */
	pagination?: SubscriptionInvoicePagination;
}

/**
 * The same endpoint and the same filters, grouped by org.
 *
 * ⚠️ The grouping is the SERVER's, and has to be: this list is paginated, so
 * grouping a page in the browser would build cards out of whatever ten invoices
 * happened to land on it — an org holding three periods would show one, under a
 * heading claiming to be everything it owes. The server pages the orgs first and
 * then fetches each one's invoices whole, so a card is complete by construction.
 */
export async function fetchSubscriptionInvoiceGroups(
	params: SubscriptionInvoiceQueryParams = {},
	onRefreshFail: () => void,
): Promise<SubscriptionInvoiceGroupsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		groupBy: "subscriber",
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
	const response = await client.get<SubscriptionInvoiceGroupsApiResponse>(
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
	/**
	 * The bank reference, when marking paid. Optional, and only meaningful in
	 * that direction — the server writes it to `subscription_payment` alongside
	 * the settlement, which is what finally gives the subscription side the
	 * equivalent of `payment_voucher.bank_ref`.
	 */
	reference?: string | null,
): Promise<SubscriptionInvoiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<SubscriptionInvoiceApiResponse>(
		`/subscription-invoice/${id}`,
		{ status, ...(status === "paid" && reference ? { reference } : {}) },
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
