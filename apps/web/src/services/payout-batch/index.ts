import { getClient } from "@/lib/axios-v1";

/**
 * The agency's payout runs — flow 2, agency pays PR.
 *
 * ⚠️ Distinct from `services/subscription-payment`, which is flow 1 (an org
 * pays InnocenZ). They share no table and no endpoint. InnocenZ never holds the
 * money in this direction: the agency uploads the exported file to its own
 * bank, and these calls only record what happened.
 *
 * ⚠️ NO FULL ACCOUNT NUMBER CROSSES THIS BOUNDARY. The server masks to last 4
 * (`bankAccountMasked`) at the model layer; the unmasked value exists only
 * inside the CSV the bank receives. Do not add a `bankAccountNo` field here to
 * "make the UI nicer" — a screen needs to identify an account, not reproduce it.
 */

export type PayoutMethod = "ibg" | "duitnow" | "manual" | "provider";

export type PayoutBatchStatus =
	| "draft"
	| "exported"
	| "submitted"
	| "settled"
	| "cancelled";

/**
 * Per LINE, because a batch does not fail — its items do. A run where 57 landed
 * and 2 bounced is `settled` with two visible failures.
 */
export type PayoutItemStatus =
	| "pending"
	| "sent"
	| "paid"
	| "failed"
	| "returned"
	| "cancelled";

export interface PayoutBatchItem {
	id: string;
	batchId: string;
	voucherId: string;
	payeeName: string | null;
	payeeIc: string | null;
	bankName: string | null;
	/** Last 4 only, e.g. "••••8901". Never the full number. */
	bankAccountMasked: string | null;
	/** Decimal string as stored, e.g. "875.00". Format with `formatRM`. */
	amount: string;
	status: PayoutItemStatus;
	failureReason: string | null;
	providerPayoutId: string | null;
	bankRef: string | null;
	paidAt: string | null;
}

export interface PayoutBatch {
	id: string;
	agencyId: string;
	reference: string | null;
	weekStart: string | null;
	weekEnd: string | null;
	method: PayoutMethod;
	status: PayoutBatchStatus;
	provider: string | null;
	totalAmount: string;
	itemCount: number;
	exportedAt: string | null;
	submittedAt: string | null;
	settledAt: string | null;
	note: string | null;
	items?: PayoutBatchItem[];
}

export interface PayoutCandidate {
	voucherId: string;
	voucherNo: string | null;
	prName: string;
	net: string;
	weekStart: string | null;
	weekEnd: string | null;
	payeeName: string | null;
	payeeIc: string | null;
	bankName: string | null;
	bankAccountMasked: string | null;
	/** Both bank halves present. Only payable candidates may enter a run. */
	payable: boolean;
	/** Already out in a live run — paying again would pay twice. */
	alreadyBatched: boolean;
}

export interface PayoutCandidates {
	weekStart: string;
	weekEnd: string;
	/** Blocked and already-batched rows are INCLUDED and flagged, never filtered. */
	candidates: PayoutCandidate[];
	summary: {
		total: number;
		ready: number;
		/** Signed off and cannot be paid — the number a human must react to. */
		blocked: number;
		alreadyBatched: number;
		readyTotalCents: number;
	};
	/** False in every deployment with no PAYOUT_API_KEY — a normal state. */
	providerConfigured: boolean;
}

export interface PayoutSettlementInput {
	itemId: string;
	status: "paid" | "failed" | "returned" | "sent";
	bankRef?: string;
	failureReason?: string;
}

type Envelope<T> = { success: boolean; message: string; data: T };

export async function fetchPayoutCandidates(
	weekStart: string,
	weekEnd: string,
	onRefreshFail: () => void,
): Promise<PayoutCandidates> {
	const client = getClient(onRefreshFail);
	const response = await client.get<Envelope<PayoutCandidates>>(
		`/payout-batch/candidates?weekStart=${weekStart}&weekEnd=${weekEnd}`,
	);
	return response.data.data;
}

export async function fetchPayoutBatches(
	onRefreshFail: () => void,
): Promise<PayoutBatch[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<Envelope<PayoutBatch[]>>("/payout-batch");
	return response.data.data ?? [];
}

export async function fetchPayoutBatch(
	id: string,
	onRefreshFail: () => void,
): Promise<PayoutBatch> {
	const client = getClient(onRefreshFail);
	const response = await client.get<Envelope<PayoutBatch>>(
		`/payout-batch/${id}`,
	);
	return response.data.data;
}

/**
 * Assemble a run.
 *
 * REFUSES with 409 when any chosen voucher has no bank details, and the body
 * carries `data.blocked[]` naming them. Surface those names — the whole point
 * is that the agency sees who cannot be paid rather than a file that quietly
 * omits them.
 */
export async function createPayoutBatch(
	input: {
		weekStart: string;
		weekEnd: string;
		method?: PayoutMethod;
		voucherIds?: string[];
	},
	onRefreshFail: () => void,
): Promise<PayoutBatch> {
	const client = getClient(onRefreshFail);
	const response = await client.post<Envelope<PayoutBatch>>(
		"/payout-batch",
		input,
	);
	return response.data.data;
}

/** Abandon a draft and release its vouchers. Refused once exported. */
export async function cancelPayoutBatch(
	id: string,
	onRefreshFail: () => void,
): Promise<PayoutBatch> {
	const client = getClient(onRefreshFail);
	const response = await client.post<Envelope<PayoutBatch>>(
		`/payout-batch/${id}/cancel`,
	);
	return response.data.data;
}

export async function markPayoutBatchSubmitted(
	id: string,
	onRefreshFail: () => void,
): Promise<PayoutBatch> {
	const client = getClient(onRefreshFail);
	const response = await client.post<Envelope<PayoutBatch>>(
		`/payout-batch/${id}/submitted`,
	);
	return response.data.data;
}

export async function settlePayoutBatch(
	id: string,
	settlements: PayoutSettlementInput[],
	onRefreshFail: () => void,
): Promise<PayoutBatch> {
	const client = getClient(onRefreshFail);
	const response = await client.post<Envelope<PayoutBatch>>(
		`/payout-batch/${id}/settle`,
		{ settlements },
	);
	return response.data.data;
}

/**
 * Download the bank file.
 *
 * ⚠️ THIS GET MUTATES — the server moves the run to `exported` and its lines to
 * `sent`, because the download IS the handover. Invalidate the batch queries
 * after calling it, and never wire it to a prefetch-on-hover: hovering a link
 * would silently send a run.
 */
export async function downloadPayoutCsv(
	batch: Pick<PayoutBatch, "id" | "reference" | "weekStart">,
	onRefreshFail: () => void,
): Promise<void> {
	const client = getClient(onRefreshFail);
	const response = await client.get(`/payout-batch/${batch.id}/export.csv`, {
		responseType: "blob",
	});
	const ref = (batch.reference ?? "batch").replace(/[^A-Za-z0-9_-]/g, "");
	const name = batch.weekStart
		? `payout-${ref}-${batch.weekStart}.csv`
		: `payout-${ref}.csv`;
	const url = URL.createObjectURL(response.data as Blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
