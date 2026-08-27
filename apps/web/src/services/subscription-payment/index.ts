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
