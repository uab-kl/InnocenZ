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
/**
 * The rails an org can pay on. Only `card` and `fpx_mandate` can ever be charged
 * automatically; the rest are one-off by nature, and the UI says so rather than
 * offering an auto-pay toggle it cannot honour.
 */
export const paymentMethodTypes = [
	"card",
	"fpx",
	"fpx_mandate",
	"ewallet",
	"duitnow",
	"manual_transfer",
] as const;
export type PaymentMethodType = (typeof paymentMethodTypes)[number];

/**
 * A direct debit mandate's life. `pending` is the one that matters: the venue
 * has asked, the bank has not agreed, and nothing may be debited.
 */
export type MandateStatus = "pending" | "active" | "cancelled" | "failed";

export interface PaymentMethod {
	id: string;
	outletId: string | null;
	agencyId: string | null;
	type: PaymentMethodType;
	brand: string;
	/** Card rails only — null on a mandate or a bank transfer. */
	last4: string | null;
	expMonth: number | null;
	expYear: number | null;
	holderName: string | null;
	billingEmail: string | null;
	mandateStatus: MandateStatus | null;
	mandateReference: string | null;
	/**
	 * WHICH BANK the direct debit is authorised at — never an account number.
	 * The payer is redirected to their own bank, which creates the mandate; the
	 * number never reaches this app and no field for it exists anywhere.
	 */
	bankCode: string | null;
	bankName: string | null;
	/** E-wallet rails only — the roster code, e.g. "TNG". Null on every other. */
	walletProvider: string | null;
	gateway: string | null;
	gatewayToken: string | null;
	autoPay: boolean;
	/** Which instrument would be charged, when an org holds several. */
	isDefault: boolean;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface SavePaymentMethodInput {
	type: PaymentMethodType;
	brand?: string;
	/** EXACTLY four digits — the server rejects anything longer. Card rails only. */
	last4?: string | null;
	expMonth?: number | null;
	expYear?: number | null;
	holderName?: string | null;
	billingEmail?: string | null;
	/**
	 * Sent for a mandate rail, but NOT trusted: the server forces `pending`,
	 * because only the payer's bank can approve a direct debit.
	 */
	mandateReference?: string | null;
	/** PayNet code of the bank to redirect to. Required for `fpx_mandate`. */
	bankCode?: string | null;
	/**
	 * Ignored by the server since 2 Sep 2026: the e-wallet rail can no longer
	 * be SAVED (only card and bank direct debit auto-debit, and a saved method
	 * means auto-debit). Kept so the shape still matches older rows read back.
	 */
	walletProvider?: string | null;
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

/** Save (or replace) the caller's instrument — one default per organisation. */
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
 * Retire the caller's saved instrument — auto-debit off, the org pays each
 * period by FPX from then on. Returns the SERVER'S sentence so the screen can
 * show what actually happened rather than a local guess.
 */
export async function removeMyPaymentMethod(
	id: string,
	onRefreshFail: () => void,
	outletId?: string,
): Promise<string> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{
		success: boolean;
		message: string;
		data: unknown;
	}>(
		`/payment-method/mine/${encodeURIComponent(id)}${buildQueryParams({ outletId })}`,
	);
	return response.data.message;
}

export interface FpxBank {
	code: string;
	name: string;
}

/**
 * The FPX banks a venue can authorise a direct debit at.
 *
 * Fetched from the server rather than hardcoded here, so the picker cannot
 * offer a bank the save would then reject — two copies of this roster is
 * exactly how that mismatch happens.
 */
export async function fetchFpxBanks(
	onRefreshFail: () => void,
): Promise<FpxBank[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: FpxBank[];
	}>("/payment-method/banks");
	return response.data.data ?? [];
}

export interface EwalletProvider {
	code: string;
	name: string;
}

/**
 * The e-wallets a venue can say it pays from — Touch 'n Go, GrabPay, ShopeePay,
 * Boost.
 *
 * From the SERVER's roster, the same as the banks above: the save validates
 * against that list, so a hardcoded copy here is how the picker comes to offer a
 * wallet the save rejects.
 *
 * ⚠️ Saving one records an INTENTION to pay, not a standing authority to debit.
 * Every wallet here is a push rail — the payer approves each payment inside
 * their own app — which is why the server forces `autoPay` false on it.
 */
export async function fetchEwalletProviders(
	onRefreshFail: () => void,
): Promise<EwalletProvider[]> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: EwalletProvider[];
	}>("/payment-method/wallets");
	return response.data.data ?? [];
}

/**
 * How a saved instrument reads on screen.
 *
 * ONE copy, because three surfaces print it — the Payment method card and both
 * Subscription pages — and each used to hardcode `{brand} ···· {last4}`. That
 * was correct while a card was the only rail; on a bank transfer it renders
 * "Card ···· ····", which looks like a card whose digits failed to load rather
 * than a venue that pays by transfer.
 *
 * Labels are passed in rather than imported so this stays free of the i18n
 * context and the caller keeps control of the language.
 */
export function describePaymentMethod(
	method: PaymentMethod,
	labels: { transfer: string; fpx: string; fpxLink: string; ewallet: string },
	/**
	 * Wallet code → display name, from `fetchEwalletProviders`. Optional because
	 * most callers never hold a wallet row; without it the code itself is shown
	 * ("E-wallet · TNG"), which is still true — unlike the fall-through below.
	 */
	walletNames?: Record<string, string>,
): string {
	if (method.type === "manual_transfer") return labels.transfer;
	// One-off FPX stores no bank — the venue picks it at pay time — so there is
	// nothing to print beside the rail's name.
	if (method.type === "fpx") return labels.fpxLink;
	// The bank is what a venue recognises its own mandate by — "Bank direct
	// debit" alone reads the same for every venue on the rail.
	if (method.type === "fpx_mandate")
		return method.bankName ? `${labels.fpx} · ${method.bankName}` : labels.fpx;
	// An e-wallet has a brand of "Card" (the column default) and no last four,
	// so letting it fall through printed "Card ···· ····" — a card whose digits
	// looked like they had failed to load.
	if (method.type === "ewallet") {
		const name =
			(method.walletProvider && walletNames?.[method.walletProvider]) ||
			method.walletProvider;
		return name ? `${labels.ewallet} · ${name}` : labels.ewallet;
	}
	return `${method.brand} ···· ${method.last4 ?? "····"}`;
}

/**
 * WILL THIS INSTRUMENT BE CHARGED, or does the venue still have to pay by hand?
 *
 * Both subscription pages appended "· next charge {date}" to the collapsed
 * Payment method header whenever a renewal date existed — over a bank transfer,
 * which nothing can auto-charge, and over an FPX mandate the bank has NOT yet
 * approved. Each page did carry a pending-mandate warning, and both put it
 * INSIDE the section, which is collapsed by default: the reassuring sentence
 * was the visible one and the correction was the hidden one.
 *
 * Deliberately NOT keyed off the server's `chargeable`, which also requires a
 * gateway token and is therefore false for every instrument today — that would
 * silence the renewal date for cards too. The question here is about the RAIL
 * and the mandate's own state, which is knowable now.
 */
export function willAutoCharge(method: PaymentMethod): boolean {
	if (method.type === "card") return true;
	if (method.type === "fpx_mandate") return method.mandateStatus === "active";
	return false;
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
