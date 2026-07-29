import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type PaymentVoucherStatus =
	| "pending_review"
	| "sent"
	| "signed"
	| "paid"
	| "disputed";

export interface PaymentVoucherPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

/** Which bucket a line belongs to. NULL on rows written before classification. */
export type PaymentVoucherComponent =
	| "wages"
	| "drink_commission"
	| "tip_commission"
	| "ot"
	| "deduction"
	| "other";

export interface PaymentVoucherLine {
	id: string;
	voucherId: string;
	lineDate: string | null;
	outlet: string | null;
	description: string;
	quantity: number;
	// numeric(12,2) is serialized as a string by the backend.
	amount: string;
	ref: string | null;
	sortOrder: number;
	component: PaymentVoucherComponent | null;
	/** The receipt this line came from; null for wage seals and legacy rows. */
	receiptId: string | null;
}

/** How a receipt reached the system — scanned, typed by hand, or auto-sealed. */
export type PaymentVoucherReceiptSource = "scan" | "manual" | "checkin";

/**
 * One receipt backing a voucher's commission. This is the evidence the agency
 * verifies against: a line with no receipt behind it was self-declared.
 */
export interface PaymentVoucherReceipt {
	id: string;
	voucherId: string;
	shiftAssignmentId: string | null;
	receiptNo: string;
	orderNo: string | null;
	source: PaymentVoucherReceiptSource;
	receiptDate: string | null;
	receiptTime: string | null;
	proofPhotos: string[] | null;
	note: string | null;
}

export interface PaymentVoucher {
	id: string;
	agencyId: string;
	prId: string | null;
	prName: string;
	prIc: string | null;
	outlet: string | null;
	cycle: string | null;
	issuedDate: string | null;
	dueDate: string | null;
	weekStart: string | null;
	weekEnd: string | null;
	subtotal: string;
	deduction: string;
	net: string;
	status: PaymentVoucherStatus;
	financeHeadName: string | null;
	financeHeadSignedAt: string | null;
	prSignedAt: string | null;
	paidAt: string | null;
	bankRef: string | null;
	disputeReason: string | null;
	disputedAt: string | null;
	disputeNote: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

// getById returns the voucher with its line items; list omits them.
export interface PaymentVoucherWithLines extends PaymentVoucher {
	lines: PaymentVoucherLine[];
	/** Only the agency/admin detail route returns these; absent on list rows. */
	receipts?: PaymentVoucherReceipt[];
}

export interface PaymentVouchersQueryParams {
	prId?: string;
	status?: PaymentVoucherStatus;
	prName?: string;
	fromDate?: string;
	toDate?: string;
	// Admin-only; agency callers are pinned to their own agency server-side.
	agencyId?: string;
	page?: number;
	pageSize?: number;
}

export interface PaymentVouchersApiResponse {
	success: boolean;
	message: string;
	pagination: PaymentVoucherPagination;
	data: PaymentVoucher[];
}

export interface PaymentVoucherLineInput {
	lineDate?: string;
	outlet?: string;
	description: string;
	quantity?: number;
	amount: number;
	ref?: string;
}

export interface CreatePaymentVoucherInput {
	agencyId?: string;
	prId?: string;
	prName: string;
	prIc?: string;
	outlet?: string;
	cycle?: string;
	issuedDate?: string;
	dueDate?: string;
	weekStart?: string;
	weekEnd?: string;
	// Omit to let the backend derive subtotal from lines and net from subtotal.
	subtotal?: number;
	deduction?: number;
	net?: number;
	financeHeadName?: string;
	bankRef?: string;
	lines?: PaymentVoucherLineInput[];
}

export interface UpdatePaymentVoucherInput
	extends Partial<CreatePaymentVoucherInput> {
	status?: PaymentVoucherStatus;
	disputeReason?: string;
	disputeNote?: string;
}

export async function fetchPaymentVouchers(
	params: PaymentVouchersQueryParams = {},
	onRefreshFail: () => void,
): Promise<PaymentVouchersApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		prId: params.prId,
		status: params.status,
		prName: params.prName,
		fromDate: params.fromDate,
		toDate: params.toDate,
		agencyId: params.agencyId,
		page: params.page,
		pageSize: params.pageSize,
	});

	const response = await client.get<PaymentVouchersApiResponse>(
		`/payment-voucher${queryString}`,
	);

	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export async function fetchPaymentVoucher(
	id: string,
	onRefreshFail: () => void,
): Promise<PaymentVoucherWithLines> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PaymentVoucherWithLines;
	}>(`/payment-voucher/${id}`);
	return response.data.data;
}

export async function createPaymentVoucher(
	input: CreatePaymentVoucherInput,
	onRefreshFail: () => void,
): Promise<PaymentVoucherWithLines> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: PaymentVoucherWithLines;
	}>("/payment-voucher", input);
	return response.data.data;
}

export async function updatePaymentVoucher(
	id: string,
	input: UpdatePaymentVoucherInput,
	onRefreshFail: () => void,
): Promise<PaymentVoucherWithLines> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: PaymentVoucherWithLines;
	}>(`/payment-voucher/${id}`, input);
	return response.data.data;
}

export async function removePaymentVoucher(
	id: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{ success: boolean; message: string }>(
		`/payment-voucher/${id}`,
	);
	return response.data;
}

/** Which part of a day's earnings a PR is contesting. */
export type DisputeComponent = "wages" | "drinks" | "tips" | "others";

/** NULL outcome = still waiting on this agency. */
export type DisputeOutcome = "accepted" | "rejected" | "withdrawn";

/**
 * One dispute, with just enough of its voucher to render a queue row without a
 * second request per dispute.
 */
export interface PaymentVoucherDispute {
	id: string;
	voucherId: string;
	/** The contested shift day, yyyy-MM-dd. */
	disputeDate: string;
	component: DisputeComponent;
	reason: string | null;
	note: string | null;
	raisedAt: string;
	/** What the voucher said when raised — computed server-side, not claimed. */
	disputedAmount: string | null;
	claimedAmount: string | null;
	proofPhotos: string[] | null;
	outcome: DisputeOutcome | null;
	resolvedAt: string | null;
	resolvedBy: string | null;
	resolutionNote: string | null;
	voucher: {
		id: string;
		prId: string | null;
		prName: string | null;
		weekStart: string | null;
		weekEnd: string | null;
		status: string;
		net: string | null;
	};
}

/** The agency's review queue. `openOnly` is what the panel opens on. */
export async function fetchDisputes(
	onRefreshFail: () => void,
	openOnly = true,
): Promise<PaymentVoucherDispute[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PaymentVoucherDispute[] | null;
	}>(`/payment-voucher/disputes${openOnly ? "?open=1" : ""}`);
	return response.data.data ?? [];
}

/**
 * Records the agency's decision. A rejection must carry a note — the server
 * enforces it too, since "no" without a reason is what makes a dispute process
 * feel arbitrary to the PR on the other end.
 */
export async function resolveDispute(
	disputeId: string,
	input: { outcome: "accepted" | "rejected"; resolutionNote?: string },
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{ success: boolean; message: string }>(
		`/payment-voucher/disputes/${disputeId}/resolve`,
		input,
	);
	return response.data;
}
