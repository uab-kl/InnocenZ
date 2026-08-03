import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * The card an outlet/agency pays its subscription with.
 *
 * ⚠️ There is no card-number or CVV field, here or in the database, and there
 * must never be one: a stored PAN puts the whole system in PCI-DSS scope and a
 * stored CVV is forbidden outright. The browser derives `brand` and `last4`
 * from what the user types and discards the rest — the number never leaves the
 * page. `gateway`/`gatewayToken` is where a real charge token would go once a
 * payment gateway is connected; until then a card can be RECORDED, not charged.
 */
export interface PaymentMethod {
	id: string;
	outletId: string | null;
	agencyId: string | null;
	brand: string;
	last4: string;
	expMonth: number;
	expYear: number;
	holderName: string | null;
	billingEmail: string | null;
	gateway: string | null;
	gatewayToken: string | null;
	autoPay: boolean;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface SavePaymentMethodInput {
	brand: string;
	/** EXACTLY four digits — the server rejects anything longer. */
	last4: string;
	expMonth: number;
	expYear: number;
	holderName?: string | null;
	billingEmail?: string | null;
	autoPay?: boolean;
	/** Required only for an operator who holds more than one venue. */
	outletId?: string;
}

/** The signed-in venue's/agency's own card, or null when none is saved. */
export async function fetchMyPaymentMethod(
	onRefreshFail: () => void,
	outletId?: string,
): Promise<PaymentMethod | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: PaymentMethod | null;
	}>(`/payment-method/mine${buildQueryParams({ outletId })}`);
	return response.data.data ?? null;
}

/** Save (or replace) the caller's card — one card per organisation. */
export async function saveMyPaymentMethod(
	input: SavePaymentMethodInput,
	onRefreshFail: () => void,
): Promise<PaymentMethod> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: PaymentMethod;
	}>("/payment-method/mine", input);
	return response.data.data;
}

/**
 * The card brand, from the leading digits — the same table every payment form
 * uses. Returns "Card" when nothing matches, rather than guessing.
 */
export function cardBrandFromNumber(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	if (/^4/.test(digits)) return "Visa";
	if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
	if (/^3[47]/.test(digits)) return "Amex";
	if (/^6(?:011|5)/.test(digits)) return "Discover";
	if (/^62/.test(digits)) return "UnionPay";
	if (/^35/.test(digits)) return "JCB";
	return "Card";
}

/**
 * Luhn check — catches a mistyped digit before the card is saved, which matters
 * more than usual here: only the last four are kept, so a typo in the middle
 * would otherwise be invisible and uncorrectable later.
 */
export function isPlausibleCardNumber(raw: string): boolean {
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 12 || digits.length > 19) return false;
	let sum = 0;
	let double = false;
	for (let i = digits.length - 1; i >= 0; i -= 1) {
		let value = Number(digits[i]);
		if (double) {
			value *= 2;
			if (value > 9) value -= 9;
		}
		sum += value;
		double = !double;
	}
	return sum % 10 === 0;
}
