import { and, eq, inArray, lt, lte, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { env } from '@/env.js';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import {
  LIVE_MEMBER_SUBSCRIPTION_STATUSES,
  MemberSubscriptionTable,
} from '@/features/member-subscription/member-subscription.model.js';
import { notifyMany } from '@/features/notification/notify.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import {
  isChargeable,
  type PaymentMethod,
  PaymentMethodTable,
} from '@/features/payment-method/payment-method.model.js';
import { klToday } from '@/features/payment-voucher/payment-voucher-week.js';
import { SubscriptionInvoiceTable } from '@/features/subscription-invoice/subscription-invoice.model.js';
import { logger } from '@/util/logger.js';
import { getGateway, listGateways, type PaymentGateway } from './payment-gateway.js';
import { SubscriptionPaymentTable } from './subscription-payment.model.js';
import { SubscriptionPaymentRepositoryClass } from './subscription-payment.repository.js';

/**
 * AUTOMATIC SUBSCRIPTION CHARGES (owner, 15 Sep 2026: "once make payment with
 * the payment method will auto charge next time untill if insufficient balance
 * need notify").
 *
 * Every day after the bills open, each org whose DEFAULT instrument is a saved,
 * chargeable card or linked Touch 'n Go wallet has each newly opened unpaid bill
 * charged ONCE:
 *
 *   • succeeded → the bill is Paid, through the one settle path (`recordAttempt`);
 *   • pending   → the gateway's webhook settles or declines it later, against
 *                 the order id this job wrote BEFORE calling it;
 *   • failed    → the bill stays Unpaid, and owner + finance are told to pay it
 *                 by FPX or e-wallet from Payment history.
 *
 * SEVEN RULES, each load-bearing:
 *
 * 1. NEVER TWICE. A bill is charged automatically at most once, ever. The claim
 *    is a `subscription_payment` row stamped `AUTO_CHARGE_ACTOR`, carrying our
 *    own deterministic order id, written in a transaction that LOCKS the
 *    invoice row. Two backend processes (the 13 Sep 2026 double run) queue on
 *    that lock and the second walks away. Only after COMMIT is the gateway called.
 * 2. NO SURPRISE BACK-CHARGES. Only a bill CREATED after the instrument was last
 *    set up (saved, re-saved, made default, token written) is charged. Old unpaid
 *    bills stay where the owner can see them and choose to pay. `updated_at`, not
 *    `created_at`: a re-save updates the row in place and would otherwise keep a
 *    months-old date. An upgrade bill opened mid-period after the save IS charged.
 * 3. A FAILED BILL IS NOT RETRIED. The owner pays it by hand; the NEXT bill is
 *    still charged. Retrying a declined card nightly is how a bank blocks a merchant.
 * 4. UNKNOWN IS NOT FAILED. A gateway that times out may still have taken the
 *    money, so the claim stays `pending` with no notice; the webhook (or the
 *    stranded-claim warning below) resolves it. Only a real decline notifies.
 * 5. NEVER OVER A PAYMENT ALREADY ON ITS WAY. A company paying by FPX B2B waits
 *    up to 7 days for its authoriser, and the bill stays unpaid meanwhile, so a
 *    bill with a manual attempt still `pending` from the last 7 days is skipped.
 *    The checkout refuses the reverse case (`autoChargeInFlight`).
 * 6. NOTHING DUE, NOTHING CHARGED. An RM 0.00 bill (a credit covered it) and a
 *    bill on a lane the org has left are not sent to the gateway.
 * 7. OFF UNLESS SWITCHED ON. It runs only where `AUTO_CHARGE_ENABLED=true` AND a
 *    registered gateway implements `chargeSavedMethod`. Every backend process
 *    starts every job, and developers' backends share the test database.
 */

/** Stamped on every automatic attempt — how the webhook tells one from a manual pay-now. */
export const AUTO_CHARGE_ACTOR = 'job:auto-charge';

/** FPX B2B: the corporate authoriser has 7 days to approve (Fiuu, status 22). */
export const MANUAL_PAYMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A card or TNG charge answers within minutes; a claim older than this is stranded. */
export const AUTO_CHARGE_STRANDED_MS = 2 * 24 * 60 * 60 * 1000;

const ORDER_PREFIX = 'AC';

/**
 * Our order id for a bill's one automatic charge: `AC` + the invoice uuid without
 * dashes (34 characters). Deterministic, so it can be written on the claim BEFORE
 * the call and a callback that beats the job home still finds its row; and
 * reversible, so the gateway adapter's `parseWebhook` — which has no database —
 * can name the invoice from the order id alone.
 */
export function autoChargeOrderId(invoiceId: string): string {
  return `${ORDER_PREFIX}${invoiceId.replace(/-/g, '').toLowerCase()}`;
}

/** The invoice uuid inside an automatic order id, or null when it is not one. */
export function invoiceIdFromAutoChargeOrderId(orderId: string): string | null {
  const match = /^AC([0-9a-f]{32})$/i.exec(orderId.trim());
  if (!match) return null;
  const hex = match[1].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const agencyMembers = new AgencyMemberRepositoryClass();
const outletMembers = new OutletMemberRepositoryClass();
const payments = new SubscriptionPaymentRepositoryClass();

/** One unpaid bill and the instrument that would pay it. */
export type AutoChargeCandidate = {
  invoiceId: string;
  invoiceNo: string;
  amount: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  invoiceCreatedAt: Date;
  subscriberType: 'agency' | 'outlet';
  subscriberId: string;
  subscriberName: string;
  laneStatus: string;
  laneEndedAt: Date | null;
  method: PaymentMethod;
};

export type SkipReason =
  | 'not_chargeable'
  | 'other_gateway'
  | 'not_started'
  | 'nothing_due'
  | 'lane_ended'
  | 'before_saved';

type ClaimSkip = 'already_claimed' | 'manual_in_progress' | 'nothing_due' | 'claim_error';
type ClaimOutcome = { claimId: string; orderId: string; amount: string; currency: string } | { skip: ClaimSkip };

const toCents = (amount: string) => {
  const cents = Math.round(Number(amount) * 100);
  return Number.isFinite(cents) ? cents : 0;
};

/**
 * Should this bill be charged automatically today? Pure, so the rules above are
 * testable without a database or a gateway.
 */
export function autoChargeDecision(
  candidate: Pick<
    AutoChargeCandidate,
    'periodStart' | 'amount' | 'invoiceCreatedAt' | 'laneStatus' | 'laneEndedAt' | 'method'
  >,
  gatewayName: string,
  today: string,
): { charge: true } | { charge: false; reason: SkipReason } {
  const method = candidate.method;
  // Only what the gateway can pull with nobody present: a card token, or a
  // linked Touch 'n Go wallet (`isChargeable` checks the provider). An FPX
  // mandate is refused by name — the chosen gateway has no such rail.
  if (method.type !== 'card' && method.type !== 'ewallet') return { charge: false, reason: 'not_chargeable' };
  if (!method.autoPay || !isChargeable(method)) return { charge: false, reason: 'not_chargeable' };
  if (method.gateway !== gatewayName) return { charge: false, reason: 'other_gateway' };
  if (candidate.periodStart > today) return { charge: false, reason: 'not_started' };
  if (toCents(candidate.amount) <= 0) return { charge: false, reason: 'nothing_due' };
  const laneLive =
    candidate.laneEndedAt === null &&
    (LIVE_MEMBER_SUBSCRIPTION_STATUSES as readonly string[]).includes(candidate.laneStatus);
  if (!laneLive) return { charge: false, reason: 'lane_ended' };
  // Rule 2 — opened after the instrument was last set up.
  if (candidate.invoiceCreatedAt.getTime() < method.updatedAt.getTime()) {
    return { charge: false, reason: 'before_saved' };
  }
  return { charge: true };
}

type AttemptView = { status: string; createdBy: string; updatedAt: Date };

/** Rule 5 — is a payment the payer started by hand still in flight? Pure, for tests. */
export function manualPaymentInFlight(attempts: AttemptView[], now: Date): boolean {
  return attempts.some(
    (attempt) =>
      attempt.createdBy !== AUTO_CHARGE_ACTOR &&
      attempt.status === 'pending' &&
      now.getTime() - attempt.updatedAt.getTime() < MANUAL_PAYMENT_WINDOW_MS,
  );
}

/**
 * The reverse of rule 5, for the checkout: is this bill's automatic charge still
 * being processed? A claim stranded past `AUTO_CHARGE_STRANDED_MS` no longer
 * blocks, so a dead process can never lock an owner out of paying by hand.
 */
export function autoChargeInFlight(attempts: AttemptView[], now: Date): boolean {
  return attempts.some(
    (attempt) =>
      attempt.createdBy === AUTO_CHARGE_ACTOR &&
      (attempt.status === 'initiated' || attempt.status === 'pending') &&
      now.getTime() - attempt.updatedAt.getTime() < AUTO_CHARGE_STRANDED_MS,
  );
}

/** `"6999.00", "MYR"` -> `RM 6,999.00`. Integer cents, never float arithmetic. */
export function formatBillAmount(amount: string, currency: string): string {
  const cents = toCents(amount);
  const symbol = currency === 'MYR' ? 'RM' : currency;
  const whole = Math.trunc(Math.abs(cents) / 100).toLocaleString('en-MY');
  const part = String(Math.abs(cents) % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${symbol} ${whole}.${part}`;
}

/** The words an owner reads when an automatic charge failed. Pure, for tests. */
export function autoChargeFailedMessage(params: {
  amount: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  methodType: string;
  reason: string | null;
}): { title: string; body: string } {
  const amount = formatBillAmount(params.amount, params.currency);
  const instrument = params.methodType === 'ewallet' ? 'your e-wallet' : 'your card';
  const why = params.reason?.trim() ? ` (${params.reason.trim()})` : '';
  return {
    title: `Automatic payment failed: ${amount}`,
    body:
      `We could not charge ${instrument} for ${params.periodStart} to ${params.periodEnd}${why}. ` +
      'The bill is still unpaid — pay it by FPX or e-wallet from Subscription, Payment history.',
  };
}

/**
 * Tell owner + finance that an automatic charge failed — the same people the
 * bill-opened notice goes to. NEVER THROWS: telling someone must not be able to
 * fail the charge run or the webhook.
 */
export async function notifyAutoChargeFailed(params: {
  subscriberType: 'agency' | 'outlet';
  subscriberId: string;
  subscriberName: string;
  invoiceId: string;
  invoiceNo: string;
  amount: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  methodType: string;
  reason: string | null;
}): Promise<number> {
  try {
    const members =
      params.subscriberType === 'agency'
        ? await agencyMembers.listByAgency(params.subscriberId)
        : await outletMembers.listByOutlet(params.subscriberId);
    const recipients = members
      .filter((member) => member.status === 'active')
      .filter((member) => member.subRole === 'owner' || member.subRole === 'finance')
      .map((member) => member.userId);
    if (recipients.length === 0) {
      logger.warn(
        `[auto-charge] ${params.subscriberName}: ${params.invoiceNo} failed but no active owner/finance member was found to tell`,
      );
      return 0;
    }
    const message = autoChargeFailedMessage(params);
    return await notifyMany(recipients, {
      kind: 'subscription_autopay_failed',
      title: message.title,
      body: message.body,
      payload: {
        invoiceId: params.invoiceId,
        invoiceNo: params.invoiceNo,
        amount: params.amount,
        currency: params.currency,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        methodType: params.methodType,
        reason: params.reason,
      },
    });
  } catch (error) {
    logger.error(`[auto-charge] could not tell ${params.subscriberName} about ${params.invoiceNo}:`, error);
    return 0;
  }
}

/** Unpaid, started bills of orgs whose DEFAULT instrument is active. */
async function listCandidates(today: string): Promise<AutoChargeCandidate[]> {
  const rows = await db
    .select({ invoice: SubscriptionInvoiceTable, subscription: MemberSubscriptionTable, method: PaymentMethodTable })
    .from(SubscriptionInvoiceTable)
    .innerJoin(
      MemberSubscriptionTable,
      eq(MemberSubscriptionTable.id, SubscriptionInvoiceTable.memberSubscriptionId),
    )
    .innerJoin(
      PaymentMethodTable,
      and(
        eq(PaymentMethodTable.isDefault, true),
        eq(PaymentMethodTable.status, 'active'),
        or(
          and(
            eq(MemberSubscriptionTable.subscriberType, 'agency'),
            eq(PaymentMethodTable.agencyId, MemberSubscriptionTable.subscriberId),
          ),
          and(
            eq(MemberSubscriptionTable.subscriberType, 'outlet'),
            eq(PaymentMethodTable.outletId, MemberSubscriptionTable.subscriberId),
          ),
        ),
      ),
    )
    .where(
      and(eq(SubscriptionInvoiceTable.status, 'unpaid'), lte(SubscriptionInvoiceTable.periodStart, today)),
    );

  return rows.map(({ invoice, subscription, method }) => ({
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    amount: invoice.amount,
    currency: invoice.currency,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    invoiceCreatedAt: invoice.createdAt,
    subscriberType: subscription.subscriberType,
    subscriberId: subscription.subscriberId,
    subscriberName: subscription.subscriberName,
    laneStatus: subscription.status,
    laneEndedAt: subscription.endedAt,
    method,
  }));
}

/**
 * Rules 1, 5 and 6 — claim the bill, or learn why not. Everything is re-read
 * under the invoice lock, and the amount handed to the gateway is the one read
 * here, never the candidate list's copy.
 */
async function claim(candidate: AutoChargeCandidate, gateway: PaymentGateway, now: Date): Promise<ClaimOutcome> {
  return db.transaction(async (tx): Promise<ClaimOutcome> => {
    const [invoice] = await tx
      .select()
      .from(SubscriptionInvoiceTable)
      .where(eq(SubscriptionInvoiceTable.id, candidate.invoiceId))
      .limit(1)
      .for('update');
    if (!invoice || invoice.status !== 'unpaid') return { skip: 'already_claimed' };
    if (toCents(invoice.amount) <= 0) return { skip: 'nothing_due' };

    const attempts = await tx
      .select({
        status: SubscriptionPaymentTable.status,
        createdBy: SubscriptionPaymentTable.createdBy,
        updatedAt: SubscriptionPaymentTable.updatedAt,
      })
      .from(SubscriptionPaymentTable)
      .where(eq(SubscriptionPaymentTable.subscriptionInvoiceId, invoice.id));
    if (attempts.some((attempt) => attempt.createdBy === AUTO_CHARGE_ACTOR)) return { skip: 'already_claimed' };
    if (manualPaymentInFlight(attempts, now)) return { skip: 'manual_in_progress' };

    const orderId = autoChargeOrderId(invoice.id);
    const [row] = await tx
      .insert(SubscriptionPaymentTable)
      .values({
        subscriptionInvoiceId: invoice.id,
        paymentMethodId: candidate.method.id,
        methodType: candidate.method.type,
        gateway: gateway.name,
        // Written BEFORE the call, so the unique (gateway, gateway_payment_id,
        // invoice) index backs the claim and an early callback finds this row.
        gatewayPaymentId: orderId,
        reference: orderId,
        amount: invoice.amount,
        currency: invoice.currency,
        status: 'initiated',
        createdBy: AUTO_CHARGE_ACTOR,
        updatedBy: AUTO_CHARGE_ACTOR,
      })
      .onConflictDoNothing()
      .returning({ id: SubscriptionPaymentTable.id });
    if (!row) return { skip: 'already_claimed' };
    return { claimId: row.id, orderId, amount: invoice.amount, currency: invoice.currency };
  });
}

/** Automatic claims left unresolved past the stranded window — surfaced, never silently kept. */
async function listStrandedClaims(now: Date) {
  return db
    .select({ id: SubscriptionPaymentTable.id, invoiceNo: SubscriptionInvoiceTable.invoiceNo })
    .from(SubscriptionPaymentTable)
    .innerJoin(SubscriptionInvoiceTable, eq(SubscriptionInvoiceTable.id, SubscriptionPaymentTable.subscriptionInvoiceId))
    .where(
      and(
        eq(SubscriptionPaymentTable.createdBy, AUTO_CHARGE_ACTOR),
        inArray(SubscriptionPaymentTable.status, ['initiated', 'pending']),
        lt(SubscriptionPaymentTable.updatedAt, new Date(now.getTime() - AUTO_CHARGE_STRANDED_MS)),
      ),
    );
}

export type AutoChargeRunResult = {
  gateway: string | null;
  enabled: boolean;
  scanned: number;
  charged: number;
  succeeded: number;
  pending: number;
  failed: number;
  recordErrors: number;
  stranded: string[];
  skipped: Record<SkipReason | ClaimSkip, number>;
};

/** One pass. Exported so it can be run on demand as well as by the scheduler. */
export async function runAutoCharge(now: Date = new Date()): Promise<AutoChargeRunResult> {
  const today = klToday(now);
  const result: AutoChargeRunResult = {
    gateway: null,
    enabled: env.AUTO_CHARGE_ENABLED === 'true',
    scanned: 0,
    charged: 0,
    succeeded: 0,
    pending: 0,
    failed: 0,
    recordErrors: 0,
    stranded: [],
    skipped: {
      not_chargeable: 0,
      other_gateway: 0,
      not_started: 0,
      nothing_due: 0,
      lane_ended: 0,
      before_saved: 0,
      already_claimed: 0,
      manual_in_progress: 0,
      claim_error: 0,
    },
  };

  // Rule 7.
  if (!result.enabled) {
    logger.info('[auto-charge] AUTO_CHARGE_ENABLED is not "true" in this process — nothing charged');
    return result;
  }
  const [gatewayName] = listGateways();
  const gateway = gatewayName ? getGateway(gatewayName) : null;
  if (!gateway?.chargeSavedMethod) {
    logger.info(
      gateway
        ? `[auto-charge] ${gateway.name} cannot charge saved methods yet — nothing charged`
        : '[auto-charge] no payment gateway is registered — nothing charged',
    );
    return result;
  }
  result.gateway = gateway.name;

  // Rule 4's other half: an unknown outcome must not sit unseen.
  result.stranded = (await listStrandedClaims(now).catch(() => [])).map((row) => row.invoiceNo);
  if (result.stranded.length > 0) {
    logger.warn(
      `[auto-charge] ${result.stranded.length} automatic charge(s) still unresolved after 2 days — check them with ${gateway.name}: ${result.stranded.join(', ')}`,
    );
  }

  const candidates = await listCandidates(today);
  result.scanned = candidates.length;

  for (const candidate of candidates) {
    const decision = autoChargeDecision(candidate, gateway.name, today);
    if (!decision.charge) {
      result.skipped[decision.reason] += 1;
      continue;
    }

    const claimed = await claim(candidate, gateway, now).catch((error): ClaimOutcome => {
      logger.error(`[auto-charge] could not claim ${candidate.invoiceNo}:`, error);
      return { skip: 'claim_error' };
    });
    if ('skip' in claimed) {
      result.skipped[claimed.skip] += 1;
      continue;
    }
    result.charged += 1;

    let outcome: 'pending' | 'succeeded' | 'failed';
    let providerReference: string | null = null;
    let failureReason: string | null = null;
    try {
      const charge = await gateway.chargeSavedMethod({
        orderId: claimed.orderId,
        invoice: {
          id: candidate.invoiceId,
          invoiceNo: candidate.invoiceNo,
          amount: claimed.amount,
          currency: claimed.currency,
        },
        method: {
          type: candidate.method.type,
          token: candidate.method.gatewayToken ?? '',
          walletProvider: candidate.method.walletProvider,
        },
        payer: { name: candidate.subscriberName, email: candidate.method.billingEmail },
      });
      outcome = charge.outcome;
      providerReference = charge.reference ?? null;
      failureReason = charge.outcome === 'failed' ? (charge.failureReason ?? null) : null;
    } catch (error) {
      // Rule 4: the provider may have taken the money before the line dropped.
      // Leave it pending for the webhook; do NOT tell the owner it failed.
      logger.error(
        `[auto-charge] ${gateway.name} charge for ${candidate.invoiceNo} threw — outcome unknown, left pending:`,
        error,
      );
      outcome = 'pending';
    }

    const recorded = await payments.recordAttempt({
      subscriptionInvoiceId: candidate.invoiceId,
      methodType: candidate.method.type,
      paymentMethodId: candidate.method.id,
      gateway: gateway.name,
      gatewayPaymentId: claimed.orderId,
      reference: providerReference ?? claimed.orderId,
      failureReason,
      outcome,
      actor: AUTO_CHARGE_ACTOR,
    });
    if (!recorded.ok) {
      result.recordErrors += 1;
      logger.error(`[auto-charge] could not record the ${outcome} charge for ${candidate.invoiceNo}`);
      continue;
    }

    result[outcome] += 1;
    // Only if THIS call recorded the decline — a callback that beat the job home
    // has already recorded it and told the owner.
    if (outcome === 'failed' && !recorded.alreadyRecorded) {
      await notifyAutoChargeFailed({
        subscriberType: candidate.subscriberType,
        subscriberId: candidate.subscriberId,
        subscriberName: candidate.subscriberName,
        invoiceId: candidate.invoiceId,
        invoiceNo: candidate.invoiceNo,
        amount: claimed.amount,
        currency: claimed.currency,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
        methodType: candidate.method.type,
        reason: failureReason,
      });
    }
  }

  return result;
}
