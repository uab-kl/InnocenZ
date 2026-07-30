import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type CollectionInvoiceStatus = "draft" | "issued" | "settled" | "void";

/**
 * Derived by the server on every read, never stored — a stored bucket is wrong
 * the next morning. Null unless the invoice is `issued`: a draft has not been
 * sent to anyone, and settled/void are done.
 */
export type CollectionInvoiceAging = "current" | "due_soon" | "overdue" | null;

/**
 * What one outlet owes this agency for one week of PR work.
 *
 * A statement of account, not a payment rail — there is no pay endpoint and no
 * payment fields, because the two parties settle between themselves. `settledAt`
 * records that the agency SAYS it was paid, which is bookkeeping rather than
 * evidence, and nothing here should present it as verified.
 */
export interface CollectionInvoice {
	id: string;
	agencyId: string;
	outletId: string;
	/** Snapshot taken at drafting, so a renamed outlet does not rewrite history. */
	outletName: string;
	weekStart: string;
	weekEnd: string;
	// numeric(12,2) is serialized as a string by the backend.
	amount: string;
	currency: string;
	status: CollectionInvoiceStatus;
	issuedAt: string | null;
	settledAt: string | null;
	note: string | null;
	/** The assignments the figure was built from — it stays traceable. */
	sourceAssignmentIds: string[];
	createdAt: string;
	updatedAt: string;
	aging: CollectionInvoiceAging;
}

export interface CollectionInvoicesApiResponse {
	success: boolean;
	message: string;
	data: CollectionInvoice[];
}

export interface CollectionInvoiceApiResponse {
	success: boolean;
	message: string;
	data: CollectionInvoice | null;
}

/**
 * No `agencyId` or `outletId` param: the server resolves the caller's own org
 * and overwrites anything the client asks for, so passing one would only give
 * the false impression that this filter is the thing enforcing scope.
 */
export async function fetchCollectionInvoices(
	params: { status?: CollectionInvoiceStatus; weekStart?: string },
	onRefreshFail: () => void,
): Promise<CollectionInvoicesApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		status: params.status,
		weekStart: params.weekStart,
	});
	const response = await client.get<CollectionInvoicesApiResponse>(
		`/collection-invoice${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

/** Draft -> issued. The agency stands behind the figure and the outlet sees it. */
export async function issueCollectionInvoice(
	id: string,
	onRefreshFail: () => void,
): Promise<CollectionInvoiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<CollectionInvoiceApiResponse>(
		`/collection-invoice/${id}/issue`,
	);
	return response.data;
}

/**
 * Issued -> settled. Records the agency's own confirmation that it was paid
 * outside this app; nothing here can verify that, so no caller should word it
 * as if the system saw the money.
 */
export async function settleCollectionInvoice(
	id: string,
	onRefreshFail: () => void,
): Promise<CollectionInvoiceApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<CollectionInvoiceApiResponse>(
		`/collection-invoice/${id}/settle`,
	);
	return response.data;
}
