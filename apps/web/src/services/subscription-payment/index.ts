import { getClient } from "@/lib/axios-v1";
import type {
	PaymentMethod,
	PaymentMethodType,
} from "@/services/payment-method";
import type { SubscriptionInvoice } from "@/services/subscription-invoice";

/**
 * One row per ATTEMPT against an invoice — against the invoice's one row per
 * CHARGE.
 *
 * `voided` is the one worth knowing: it is what an admin pressing "Mark unpaid"
 * produces. Nothing declined, so `failed` would invent a decline that never
 * happened; the row survives so "who said this was paid, and when did they take
 * it back" stays answerable.
 */
export type SubscriptionPaymentStatus =
	| "initiated"
	| "pending"
	| "succeeded"
	| "failed"
	| "refunded"
	| "voided";

export interface SubscriptionPayment {
	id: string;
	subscriptionInvoiceId: string;
	paymentMethodId: string | null;
	methodType: PaymentMethodType;
	gateway: string | null;
	gatewayPaymentId: string | null;
	/** The bank/gateway reference a human can match against a statement. */
	reference: string | null;
	amount: string;
	currency: string;
	status: SubscriptionPaymentStatus;
	failureReason: string | null;
	paidAt: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

/**
 * Everything the Plan Payment panel shows: what is owed, how the org pays, and
 * every attempt made against it.
 *
 * One call rather than three, deliberately — three round trips would let the
 * panel render a period as unpaid beside a settlement that had already landed,
 * and a half-drawn answer about money is worse than a slow one.
 */
/** One thing the org is billed for — its plan, or an add-on beside it. */
export interface BillingLane {
	id: string;
	planName: string;
	amount: string;
	currency: string;
	billingCycle: string;
	status: string;
	startedAt: string;
}

export interface InvoicePaymentDetail {
	invoice: SubscriptionInvoice & {
		subscriberType: "outlet" | "agency";
		subscriberId: string;
		subscriberName: string;
		planName: string;
		billingCycle: string;
	};
	payments: SubscriptionPayment[];
	/** The rails the subscriber holds. Empty when it has never saved one. */
	methods: PaymentMethod[];
	/** Name and logo read live, not the invoice's snapshot of the name. */
	org: { id: string; name: string; logoImage: string | null } | null;
	/**
	 * EVERY lane the org is billed on, not only this invoice's.
	 *
	 * A venue on Enterprise with the POS add-on is billed on two, and each opens
	 * its own invoice — so showing only this row's lane printed "Plan: POS
	 * Integration" and looked like the venue had no plan at all.
	 */
	lanes: BillingLane[];
	/**
	 * EVERY period this subscriber has been billed, newest first, paid and unpaid.
	 *
	 * The panel opens on ONE period and is where an admin decides whether to mark
	 * it paid — a decision that needs the neighbours: is this the only thing
	 * outstanding, or the fourth unpaid week running? Without it the admin has to
	 * close the drawer, expand the org card, and come back.
	 */
	history: SubscriptionInvoice[];
	/**
	 * uuid -> display name for each attempt's `createdBy`, resolved server-side.
	 * Stamps that are not people (`system`, `gateway:curlec`) are absent and the
	 * panel labels them itself.
	 */
	actors: Record<string, string>;
	/** Join with `org.logoImage` to build the logo URL. Null when R2 is off. */
	r2PublicUrl: string | null;
}

export async function fetchInvoicePaymentDetail(
	invoiceId: string,
	onRefreshFail: () => void,
): Promise<InvoicePaymentDetail> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: InvoicePaymentDetail;
	}>(`/subscription-payment/invoice/${invoiceId}`);
	return response.data.data;
}

/**
 * Which gateways are registered. Empty today — the admin panel reads it so it
 * can say "no gateway connected" rather than implying auto-charge works.
 */
/**
 * Open one hosted payment session for the periods the payer ticked.
 *
 * Returns the URL to send the browser to. A 503 means no gateway is connected
 * yet — the caller shows the server's own sentence rather than inventing one.
 */
export async function createCheckout(
	invoiceIds: string[],
	onRefreshFail: () => void,
): Promise<{ payUrl: string; totalAmount: string; currency: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: { payUrl: string; totalAmount: string; currency: string };
	}>("/subscription-payment/checkout", { invoiceIds });
	return response.data.data;
}

export async function fetchPaymentGateways(
	onRefreshFail: () => void,
): Promise<string[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: string[];
	}>("/subscription-payment/gateways");
	return response.data.data ?? [];
}

/**
 * WHY a refund is owed: money landed on a bill that was VOIDED, or on one that
 * was already PAID. Read off the payment's refund-due marker server-side.
 */
export type RefundDueReason = "voided" | "paid_twice";

/** One payment InnocenZ owes back — `GET /subscription-payment/refunds-due`. */
export interface RefundDue {
	paymentId: string;
	invoiceId: string;
	invoiceNo: string;
	subscriberType: "outlet" | "agency";
	/** The org's name NOW (joined live) — null only if the org row is gone. */
	subscriberName: string | null;
	amount: string;
	currency: string;
	methodType: PaymentMethodType;
	gateway: string | null;
	paidAt: string | null;
	reason: RefundDueReason;
}

/**
 * Every payment owed back and not yet refunded, oldest first (admin only).
 *
 * A failed request THROWS rather than answering `[]`: this list exists to say
 * money is owed, so "could not look" must never render as "nothing owed".
 */
export async function fetchRefundsDue(
	onRefreshFail: () => void,
): Promise<RefundDue[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: RefundDue[];
	}>("/subscription-payment/refunds-due");
	return response.data.data ?? [];
}

/** The refunds-due list's cache key — the card reads it, "Mark refunded" refreshes it. */
export const REFUNDS_DUE_QUERY_KEY = [
	"subscription-payment",
	"refunds-due",
] as const;

/** The server's own bound on a refund reference (`REFUND_REFERENCE_MAX` in refund-message.ts). */
export const REFUND_REFERENCE_MAX = 60;

/**
 * The two refund-due markers the server writes at the START of a payment's
 * `failureReason` (`REFUND_DUE_*_PREFIX` in refund-due.repository.ts). The
 * payment panel reads them, so an attempt whose money arrived on a voided or
 * already-paid bill is badged "Refund due" rather than as a pending payment.
 * Its test reads the backend file and fails if the spelling there moves.
 */
export const REFUND_DUE_PREFIXES = [
	"PAID FOR A VOIDED BILL — ",
	"PAID TWICE — ",
] as const;

/** Money that arrived, settled nothing, and has not been refunded yet. */
export function isRefundDue(
	payment: Pick<SubscriptionPayment, "status" | "failureReason">,
): boolean {
	return (
		payment.status !== "refunded" &&
		REFUND_DUE_PREFIXES.some(
			(prefix) => payment.failureReason?.startsWith(prefix) === true,
		)
	);
}

/**
 * The money went back: `POST /subscription-payment/:id/refunded` (admin only).
 *
 * `message` is the server's confirmation sentence, which the dialog shows
 * (translated by `localiseRefundMessage`). Only a row still owed back moves,
 * once — a second call answers 409 in words, never a second write.
 */
export async function markPaymentRefunded(
	paymentId: string,
	reference: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string; data: SubscriptionPayment }> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: SubscriptionPayment;
	}>(`/subscription-payment/${paymentId}/refunded`, { reference });
	return response.data;
}
