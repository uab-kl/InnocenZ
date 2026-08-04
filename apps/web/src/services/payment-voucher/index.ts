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
	/** Where it sits in the review (migration 0074). */
	status: PaymentVoucherReceiptStatus;
	/**
	 * When a person decided. NULL beside `approved` means the row predates the
	 * review flow — NOT that somebody approved it at epoch. Print "—", never a
	 * date derived from something else.
	 */
	reviewedAt: string | null;
	reviewedBy: string | null;
}

/**
 * The receipt review lifecycle.
 *
 * `pending` — the PR logged it and nobody has checked it. It BLOCKS the voucher's
 * send, and the PR may not dispute the money behind it yet.
 * `approved` — the agency accepted it (possibly after correcting the figures).
 * This is the state that lets the PR contest it.
 * `verified` — closed: the week rolled over untouched, or a dispute settled.
 *
 * Only `pending → approved` (and back) is reachable over HTTP; `verified` is set
 * by the Monday rollover or by resolving a dispute, never by a request.
 */
export type PaymentVoucherReceiptStatus = "pending" | "approved" | "verified";

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

export type PaymentVoucherDayStatus = "approved" | "held";

/**
 * One day of a voucher, with the agency's decision folded in.
 *
 * `status` is null when nobody has decided — there is no `pending` state, and a
 * day whose total changed since it was approved comes back null with
 * `stale: true` rather than still reading approved.
 *
 * Cents, not ringgit: `totalCents` is what the day sums to now and
 * `approvedTotalCents` is what it summed to when it was signed off. The server
 * compares them; the UI only has to show that they diverged.
 */
export interface PaymentVoucherDayReview {
	date: string;
	totalCents: number;
	status: PaymentVoucherDayStatus | null;
	stale: boolean;
	approvedTotalCents: number | null;
	note: string | null;
	/** Approved as part of an approve-all rather than opened individually. */
	bulk: boolean;
	reviewedAt: string | null;
	reviewedBy: string | null;
}

// getById returns the voucher with its line items; list omits them.
export interface PaymentVoucherWithLines extends PaymentVoucher {
	lines: PaymentVoucherLine[];
	/** Only the agency/admin detail route returns these; absent on list rows. */
	receipts?: PaymentVoucherReceipt[];
	/**
	 * Day-by-day review state. Rides on the detail route beside the lines on
	 * purpose, so a decision can never be shown next to lines it does not refer
	 * to. Absent on list rows.
	 */
	dayReviews?: PaymentVoucherDayReview[];
	allDaysReviewed?: boolean;
	/**
	 * ⚠️ Send-readiness reads THIS, never `allDaysReviewed`. Both are true when
	 * every day is decided and one of them is held — a held day IS a decision.
	 */
	hasHeldDay?: boolean;
}

export interface DayReviewResult {
	dayReviews: PaymentVoucherDayReview[];
	allDaysReviewed: boolean;
}

/**
 * Record, change or clear one day's decision. `status: null` un-reviews it.
 *
 * The body carries no amount by design — the server recomputes the day from the
 * lines and stores that as the baseline, so a client cannot approve a figure the
 * voucher never had.
 */
export async function reviewPaymentVoucherDay(
	id: string,
	date: string,
	input: { status: PaymentVoucherDayStatus | null; note?: string },
	onRefreshFail: () => void,
): Promise<DayReviewResult> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: DayReviewResult;
	}>(`/payment-voucher/${id}/day-review/${date}`, input);
	return response.data.data;
}

/** Approve every undecided day. Held days are skipped server-side. */
export async function approveAllPaymentVoucherDays(
	id: string,
	onRefreshFail: () => void,
): Promise<DayReviewResult & { message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: DayReviewResult;
	}>(`/payment-voucher/${id}/day-review/approve-all`, {});
	return { ...response.data.data, message: response.data.message };
}

/**
 * Approve one receipt, or withdraw an approval.
 *
 * `verified` is deliberately not accepted here (the server refuses it too):
 * jumping straight to closed would shut the PR's dispute window before they had
 * ever seen the figure.
 */
export async function reviewPaymentVoucherReceipt(
	receiptId: string,
	status: "pending" | "approved",
	onRefreshFail: () => void,
): Promise<PaymentVoucherReceipt> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: PaymentVoucherReceipt;
	}>(`/payment-voucher/receipts/${receiptId}/review`, { status });
	return response.data.data;
}

/**
 * Correct one line of a receipt under review — quantity, commission, or both.
 *
 * Targeted at a single line id rather than going through
 * `PUT /payment-voucher/:id`, which replaces the whole line set and once deleted
 * the PR's proof photos doing exactly this.
 *
 * Two effects to expect in the UI: the day's total changes, so that day goes
 * STALE in the day-review panel and has to be approved again; and an already
 * APPROVED receipt drops back to pending, because the receipt row stores no
 * amount and its staleness cannot be detected after the fact.
 */
export async function editPaymentVoucherReceiptLine(
	receiptId: string,
	lineId: string,
	patch: { quantity?: number; amount?: number },
	onRefreshFail: () => void,
): Promise<{ receipt: PaymentVoucherReceipt | null; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: { receipt: PaymentVoucherReceipt | null };
	}>(`/payment-voucher/receipts/${receiptId}/lines/${lineId}`, patch);
	return {
		receipt: response.data.data?.receipt ?? null,
		message: response.data.message,
	};
}

/**
 * One line as the three receipt WRITE endpoints answer with it — the PR-facing
 * DTO, not the raw row.
 *
 * The two fields that matter carry DIFFERENT NAMES on each side: `item` and
 * `commission` here against `description` and `amount` on `AgencyReceiptLine`
 * below, and the commission is a number where the row serializes numeric(12,2)
 * as a string. Callers therefore refetch the feed after a write instead of
 * splicing this into it — one shape on screen rather than two that look alike.
 */
export interface PaymentVoucherReceiptLineDTO {
	id: string;
	/** Which bucket the line's `ref` put it in. An added line lands in drinks/tips. */
	kind: "drinks" | "tips" | "wages" | "others";
	source: string;
	item: string;
	quantity: number;
	/** Gross off the paper. 0 on an agency-added line — gross is not editable. */
	sales: number;
	commission: number;
	lineDate: string | null;
	outlet: string | null;
	receiptStatus: PaymentVoucherReceiptStatus | null;
	receiptNo: string | null;
	orderNo: string | null;
	receiptDate: string | null;
}

/**
 * The only two buckets the agency may ADD.
 *
 * Wages and overtime are derived from the check-in/check-out stamps and the
 * shift's rate, so the fix for those is the attendance record, not a claimed
 * line — the server rejects them for the same reason.
 */
export type AgencyAddedLineKind = "drinks" | "tips";

/** One item the OUTLET on a receipt actually sells, as the catalogue read returns it. */
export interface ReceiptCatalogueItem {
	/** `outlet_drink_menu.slug` — stable even when the outlet re-spells the name. */
	id: string;
	/**
	 * EXACTLY what has to be posted as the add-line `description`. The server
	 * matches case-insensitively but STORES this spelling, so the line and the
	 * outlet's own list can never drift into two names for one item.
	 */
	name: string;
	/**
	 * The OUTLET'S SALE PRICE, numeric(12,2) as a string. Shown so a reviewer can
	 * check an item against the paper — it is NOT the PR's commission and must
	 * never be written into the amount.
	 */
	priceRm: string;
	/** The outlet's own section: "Drinks Price" or "Service Entitlement". */
	category: "drink" | "service" | "tip";
	/**
	 * Which add-line bucket this row may be used for — the SERVER'S split, not one
	 * the form re-derives from `category`. Two copies of that rule would disagree
	 * the first time either changed, and the form would offer an item the add
	 * endpoint then refuses. Null means neither bucket: never offer it.
	 */
	kind: AgencyAddedLineKind | null;
}

/** The outlet's published list for one receipt, plus why it may be empty. */
export interface ReceiptCatalogue {
	outletId: string | null;
	outlet: string | null;
	items: ReceiptCatalogueItem[];
	/**
	 * The server's own sentence. Degraded reads answer 200 with an EMPTY list and
	 * the SAME words the add endpoint refuses with — a receipt with no shift link,
	 * or an outlet that never configured a list. The form repeats it rather than
	 * paraphrasing, so what it says is what the write would say.
	 */
	message: string;
}

/**
 * The outlet catalogue an added line must be chosen from — the READ half of the
 * rule `addPaymentVoucherReceiptLine` is refused by.
 *
 * Takes NO outlet id: the server derives the outlet from this receipt's own
 * shift FK, so the agency cannot point the read at a catalogue that happens to
 * contain the item it wants, and can only ever see an outlet one of its own
 * vouchers was earned at. An unknown or another agency's receipt answers 404.
 */
export async function fetchPaymentVoucherReceiptCatalogue(
	receiptId: string,
	onRefreshFail: () => void,
): Promise<ReceiptCatalogue> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: {
			outletId: string | null;
			outlet: string | null;
			items: ReceiptCatalogueItem[];
		} | null;
	}>(`/payment-voucher/receipts/${receiptId}/catalogue`);
	return {
		outletId: response.data.data?.outletId ?? null,
		outlet: response.data.data?.outlet ?? null,
		items: response.data.data?.items ?? [],
		message: response.data.message,
	};
}

/**
 * Add a drink or tip line the paper carries and the log missed.
 *
 * `description` must NAME AN ITEM THE OUTLET SELLS — it is checked against the
 * catalogue above, server-side, and a name that is not on that outlet's list is
 * refused with a sentence naming the outlet. Free text is no longer accepted:
 * the outlet's price list is the only record of what was for sale that night,
 * so a line with no entry on it is money with no source document behind it.
 *
 * `amount` is the COMMISSION in ringgit as a number; the gross sale is not
 * accepted, because it is packed into the line's `ref` alongside the receipt
 * links a dispute points at. An added line therefore records RM 0.00 gross and
 * the agency's stated commission.
 *
 * Same two effects as a line correction: the day's total moves, so that day goes
 * STALE, and an approved receipt drops back to pending.
 */
export async function addPaymentVoucherReceiptLine(
	receiptId: string,
	input: {
		kind: AgencyAddedLineKind;
		description: string;
		quantity: number;
		amount: number;
		lineDate?: string;
	},
	onRefreshFail: () => void,
): Promise<{ receipt: PaymentVoucherReceipt | null; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: {
			receipt: PaymentVoucherReceipt | null;
			line: PaymentVoucherReceiptLineDTO;
		};
	}>(`/payment-voucher/receipts/${receiptId}/lines`, input);
	return {
		receipt: response.data.data?.receipt ?? null,
		message: response.data.message,
	};
}

/**
 * Correct the receipt's OWN facts — the order number read off the paper, and the
 * day it belongs to.
 *
 * `orderNo` absent leaves the stored number alone; `null` clears it, because a
 * number OCR invented off a blurred photo has to be removable and not merely
 * replaceable.
 *
 * `receiptDate` is not cosmetic: the server moves every one of this receipt's
 * lines onto that date in the same transaction, so the OLD day and the NEW one
 * both go stale. `movedLines` says how many followed.
 */
export async function editPaymentVoucherReceipt(
	receiptId: string,
	patch: {
		orderNo?: string | null;
		receiptDate?: string;
		/**
		 * The time printed on the paper. Absent leaves it alone, null clears it —
		 * OCR misreads a photographed clock, and a wrong time has to be removable
		 * rather than only replaceable. Moves no money, so no day goes stale.
		 */
		receiptTime?: string | null;
	},
	onRefreshFail: () => void,
): Promise<{
	receipt: PaymentVoucherReceipt | null;
	movedLines: number;
	message: string;
}> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{
		success: boolean;
		message: string;
		data: {
			receipt: PaymentVoucherReceipt | null;
			movedLines: number;
			lines: PaymentVoucherReceiptLineDTO[];
		};
	}>(`/payment-voucher/receipts/${receiptId}`, patch);
	return {
		receipt: response.data.data?.receipt ?? null,
		movedLines: response.data.data?.movedLines ?? 0,
		message: response.data.message,
	};
}

/** One line of a receipt as the agency feed returns it (a trimmed voucher line). */
export interface AgencyReceiptLine {
	id: string;
	lineDate: string | null;
	outlet: string | null;
	description: string;
	quantity: number;
	/** numeric(12,2), serialized as a string. */
	amount: string;
	ref: string | null;
	/**
	 * Which bucket the line's ref/component put it in. Optional so a response
	 * from a backend that has not restarted yet still parses — the editor then
	 * cannot tell what kind of receipt it is and offers the choice instead.
	 */
	kind?: "drinks" | "tips" | "wages" | "others";
}

/**
 * One receipt in the agency's CROSS-VOUCHER feed (`GET /payment-voucher/receipts`).
 *
 * Distinct from `PaymentVoucherReceipt`, which rides on one voucher's detail and
 * therefore needs no voucher or PR context. This row carries both, because the
 * feed spans every voucher the agency owns and a receipt with no PR name on it is
 * unreviewable — the reviewer cannot tell whose money it is.
 */
export interface AgencyReceipt {
	id: string;
	receiptNo: string;
	orderNo: string | null;
	source: PaymentVoucherReceiptSource;
	receiptDate: string | null;
	receiptTime: string | null;
	note: string | null;
	proofPhotos: string[];
	status: PaymentVoucherReceiptStatus;
	reviewedAt: string | null;
	reviewedBy: string | null;
	/** When the PR logged it — server time, not the time printed on the paper. */
	loggedAt: string;
	voucherId: string;
	voucherStatus: PaymentVoucherStatus;
	weekStart: string | null;
	weekEnd: string | null;
	prId: string | null;
	prName: string | null;
	prNickname: string | null;
	shiftAssignmentId: string | null;
	lines: AgencyReceiptLine[];
}

/**
 * Every receipt logged against this agency's vouchers, newest first.
 *
 * Agency-scoped server-side through the voucher join, so there is no client-side
 * tenant filter — a receipt carries no agency of its own, and filtering after the
 * fact is how cross-tenant leaks happen.
 *
 * `fromDate`/`toDate` bound the LOGGED-AT date (Asia/Kuala_Lumpur), not the
 * voucher's week. The two differ whenever a receipt is logged after midnight or
 * after the week rolls, so callers that mean "this payroll week" filter on
 * `weekStart` instead of passing dates here.
 */
export async function fetchAgencyReceipts(
	onRefreshFail: () => void,
	params: { fromDate?: string; toDate?: string } = {},
): Promise<AgencyReceipt[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		fromDate: params.fromDate,
		toDate: params.toDate,
	});
	const response = await client.get<{
		success: boolean;
		message: string;
		data: AgencyReceipt[] | null;
	}>(`/payment-voucher/receipts${queryString}`);
	return response.data.data ?? [];
}

/**
 * The agency's signature on a voucher — the "Finance sign" step, taken BEFORE
 * the voucher goes to the PR.
 *
 * Its own endpoint rather than a field on `updatePaymentVoucher`, because that
 * route rewrites the whole voucher and deletes and re-inserts every line: an
 * attestation must not be a side effect of an edit. The server takes the signer's
 * name from the session, never from here.
 *
 * Two refusals to expect, both 409: a voucher already sent cannot be re-signed
 * (the PR may have counter-signed it), and `PUT {status:'sent'}` is refused
 * outright until this has been called.
 */
export async function financeSignPaymentVoucher(
	id: string,
	signature: { w: number; h: number; strokes: [number, number][][] },
	onRefreshFail: () => void,
): Promise<PaymentVoucher> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: PaymentVoucher;
	}>(`/payment-voucher/${id}/finance-sign`, { signature });
	return response.data.data;
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
