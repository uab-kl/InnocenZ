import type { PaymentMethodType } from '@/features/payment-method/payment-method.model.js';

/**
 * THE SEAM. No gateway is connected, and this file connects none.
 *
 * What it does is fix the shape of the question, so that wiring Curlec or
 * Stripe later is a `registerGateway(...)` call plus one adapter file, rather
 * than a rewrite of how a payment is recorded. Everything downstream of here —
 * idempotency, the settle transaction, the invoice write — is already built and
 * already used by the manual path, so a provider only has to answer two
 * questions: is this delivery genuine, and what did it say.
 *
 * DELIBERATELY NOT HERE:
 *
 * - Any provider. `listGateways()` returns [] today and the webhook route says
 *   so plainly instead of pretending to accept deliveries.
 * - Gateway-side subscription objects. A provider is asked to charge an amount
 *   WE computed, never to own a plan: the agency tier is derived from PV volume,
 *   which no gateway can see, and Custom/POS prices are negotiated per org. Two
 *   subscription states would drift, and the gateway's copy would win by
 *   accident.
 */

/** What a delivery turned out to mean, once the provider has read it. */
export type WebhookOutcome = 'succeeded' | 'failed' | 'pending' | 'ignored';

/**
 * A webhook body, reduced to the facts this app acts on.
 *
 * `amount` is absent on purpose. The settle path reads what a period cost from
 * the invoice, because a body that can name its own amount is a body that can
 * settle a RM9,999 invoice for RM1.
 */
export type NormalisedWebhookEvent = {
  /** The gateway's own payment id — the idempotency key. */
  gatewayPaymentId: string;
  /** Our `subscription_invoice.id`, echoed back by the gateway. */
  subscriptionInvoiceId: string;
  outcome: WebhookOutcome;
  /** Which rail the payer actually used, when the gateway reports it. */
  methodType?: PaymentMethodType;
  reference?: string | null;
  failureReason?: string | null;
  paidAt?: Date;
};

export interface PaymentGateway {
  /** Stable slug, stored in `subscription_payment.gateway`. */
  readonly name: string;

  /**
   * Is this delivery genuinely from the gateway?
   *
   * Takes the RAW body, not the parsed one: every provider signs the exact
   * bytes it sent, and `JSON.parse` followed by `JSON.stringify` does not
   * reproduce them — key order and whitespace both move. A route that verifies
   * a re-serialised body rejects every genuine delivery and, worse, tempts
   * whoever debugs it into skipping the check.
   *
   * MUST compare in constant time against the expected signature.
   */
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;

  /** Reduce a verified delivery to the facts above, or null if it is not one we act on. */
  parseWebhook(rawBody: Buffer): NormalisedWebhookEvent | null;

  /**
   * Open ONE hosted payment session for the periods the payer ticked.
   *
   * The payer chooses its bank, wallet or card on the provider's page — nothing
   * about the instrument is decided here. The amount is the SUM the server
   * computed from the invoices, never a figure from the browser. The provider's
   * id for the session becomes `gateway_payment_id` on every one of the
   * invoices' attempt rows, which is how one webhook later settles them all.
   */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
}

export type CheckoutInput = {
  /** Our own reference for the session — echoed back by the webhook. */
  reference: string;
  invoices: { id: string; invoiceNo: string; amount: string; currency: string }[];
  totalAmount: string;
  currency: string;
  payer: { name: string; email: string | null };
  /** Where the provider sends the browser afterwards. NOT proof of payment. */
  returnUrl: string;
};

export type CheckoutResult = {
  gatewayPaymentId: string;
  payUrl: string;
};

const gateways = new Map<string, PaymentGateway>();

/**
 * Register a provider at startup. Nothing calls this yet — that is the honest
 * state of the integration, and `listGateways()` returning empty is what the
 * webhook route reports rather than accepting deliveries it cannot verify.
 */
export function registerGateway(gateway: PaymentGateway): void {
  gateways.set(gateway.name, gateway);
}

export function getGateway(name: string): PaymentGateway | null {
  return gateways.get(name) ?? null;
}

export function listGateways(): string[] {
  return [...gateways.keys()];
}
