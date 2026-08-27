import { Request, Response } from 'express';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import { paramId } from '@/util/params.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import type { PaymentMethodRepositoryClass } from '@/features/payment-method/payment-method.repository.js';
import { env } from '@/env.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import { getGateway, listGateways } from './payment-gateway.js';

/**
 * Base URL clients join with stored R2 object keys to build image URLs. Null
 * when R2 is not configured; keys are never rewritten server-side.
 *
 * ⚠️ This one-liner now exists in FOUR places (`auth.routes` ×2,
 * `payment-voucher.controller`, here). It wants to be one shared helper — not
 * folded in here, because that would mean editing three unrelated files in a
 * payments change.
 */
function r2PublicBase(): string | null {
  return env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? null;
}
import type { SubscriptionPaymentRepositoryClass } from './subscription-payment.repository.js';

export class SubscriptionPaymentControllerClass {
  constructor(
    private repository: SubscriptionPaymentRepositoryClass,
    private invoiceRepository: SubscriptionInvoiceRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
    /** How the subscriber pays — the half of the picture the invoice cannot hold. */
    private paymentMethodRepository: PaymentMethodRepositoryClass,
    /** Every lane the org is billed on: its plan, and each add-on beside it. */
    private memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
  ) {}

  /**
   * THE WHOLE PAYMENT PICTURE FOR ONE INVOICE: what is owed, how the org pays,
   * and every attempt made against it.
   *
   * Three reads behind one call, deliberately. The admin's Plan Payment panel
   * needs all three at once, and three round trips would let the panel render a
   * period as unpaid beside a settlement that had already landed — a
   * half-drawn answer about money is worse than a slow one.
   *
   * Scoped through the INVOICE, not through a subscriber id in the query: this
   * endpoint carries how other organisations pay, and a filter the caller sets
   * is a filter the caller can widen. Someone else's invoice answers 404 rather
   * than 403, so the response never confirms the id exists — the same shape
   * `subscription-invoice.getById` uses.
   */
  async listForInvoice(req: Request, res: Response) {
    try {
      const invoiceId = paramId(req.params.invoiceId);
      const invoice = await this.invoiceRepository.getById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const ownsIt =
        scope.isAdmin ||
        (invoice.subscriberType === 'agency' && invoice.subscriberId === scope.agencyId) ||
        (invoice.subscriberType === 'outlet' && scope.outletIds.includes(invoice.subscriberId));
      if (!ownsIt) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const payments = await this.repository.listFor(invoiceId);
      // Read through the invoice's OWN subscriber, never through an org id from
      // the query — the scope check above is only a scope check if what comes
      // back belongs to the row that was checked.
      const methods = await this.paymentMethodRepository.listFor(
        invoice.subscriberType === 'agency'
          ? { agencyId: invoice.subscriberId }
          : { outletId: invoice.subscriberId },
      );

      const org = await this.repository.getOrgProfile(
        invoice.subscriberType,
        invoice.subscriberId,
      );

      /**
       * EVERY LANE THE ORG IS BILLED ON, not just the one this invoice is for.
       *
       * A venue on Enterprise with the POS add-on is billed on TWO lanes, and
       * each opens its own invoice — so a panel that showed only this row's lane
       * printed "Plan: POS Integration" and looked like the venue had no plan.
       * Both are listed, and the one this invoice belongs to is flagged, so the
       * figure on screen can be placed against everything else the org pays.
       */
      const { records: lanes } = await this.memberSubscriptionRepository.listPaginated({
        filter: {
          subscriberType: invoice.subscriberType,
          subscriberId: invoice.subscriberId,
          status: 'active',
        },
        page: 1,
        pageSize: 50,
      });

      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          invoice,
          payments,
          methods,
          org,
          lanes,
          // The logo is a bare R2 key; the browser needs the base to build a URL,
          // the same way the payment-voucher endpoints hand it over.
          r2PublicUrl: r2PublicBase(),
        },
      });
    } catch (error) {
      logger.error('[SubscriptionPaymentController.listForInvoice] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Which providers are registered. Empty today, and the admin UI reads it to say so. */
  async gateways(_req: Request, res: Response) {
    res.status(200).json({ success: true, message: 'OK', data: listGateways() });
  }

  /**
   * A gateway telling us a payment settled — the endpoint that flips an invoice
   * to paid with no human involved.
   *
   * UNAUTHENTICATED BY DESIGN, because the caller is a machine that holds no
   * session. The signature IS the authentication, so the order below is not
   * negotiable: resolve the provider, verify the raw bytes, and only then look
   * at the body. Parsing first and verifying afterwards means acting on
   * attacker-controlled JSON, and every field in it points at money.
   *
   * NO GATEWAY IS REGISTERED TODAY. That path answers 503 and says so, rather
   * than 200 — a webhook that silently accepts what it cannot verify is worse
   * than one that is plainly not ready, because the gateway would stop retrying.
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      const name = String(req.params.gateway ?? '');
      const gateway = getGateway(name);
      if (!gateway) {
        logger.warn(`[subscription-payment] webhook for unregistered gateway "${name}"`);
        return res.status(503).json({
          success: false,
          message: 'No payment gateway is connected',
          data: null,
        });
      }

      // Captured by the express.json `verify` hook in main.ts. Absent means the
      // raw bytes were dropped, and a signature cannot be checked without them —
      // so this refuses rather than falling back to the parsed body.
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        logger.error('[subscription-payment] webhook raw body missing; cannot verify signature');
        return res.status(400).json({ success: false, message: 'Malformed webhook', data: null });
      }

      if (!gateway.verifySignature(rawBody, req.headers)) {
        logger.warn(`[subscription-payment] webhook signature rejected for "${name}"`);
        return res.status(401).json({ success: false, message: 'Invalid signature', data: null });
      }

      const event = gateway.parseWebhook(rawBody);
      // A delivery we do not act on is still a delivery we RECEIVED: 200, or the
      // gateway retries this same irrelevant event forever.
      if (!event || event.outcome === 'ignored') {
        return res.status(200).json({ success: true, message: 'Ignored', data: null });
      }

      // ONE call for every outcome. A failed or still-pending attempt is exactly
      // what `subscription_payment` exists to hold — dropping it is how a venue
      // gets chased with no record of the three declines behind it — and the
      // amount is read from the invoice in both cases, never from the body.
      const result = await this.repository.recordAttempt({
        subscriptionInvoiceId: event.subscriptionInvoiceId,
        methodType: event.methodType ?? 'card',
        gateway: gateway.name,
        gatewayPaymentId: event.gatewayPaymentId,
        reference: event.reference ?? null,
        failureReason: event.failureReason ?? null,
        outcome: event.outcome,
        paidAt: event.paidAt,
        actor: `gateway:${gateway.name}`,
      });

      if (!result.ok) {
        // An unknown invoice is OUR problem, not something the gateway can fix
        // by retrying — 200 so it stops, and a loud log so a human looks.
        if (result.reason === 'invoice_not_found') {
          logger.error(
            `[subscription-payment] ${gateway.name} reported on unknown invoice ${event.subscriptionInvoiceId}`,
          );
          return res.status(200).json({ success: true, message: 'Ignored', data: null });
        }
        // A transient failure SHOULD be retried, so this one is a 500.
        return res
          .status(500)
          .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      res.status(200).json({
        success: true,
        message: result.alreadyRecorded ? 'Already recorded' : 'Recorded',
        data: null,
      });
    } catch (error) {
      logger.error('[SubscriptionPaymentController.handleWebhook] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
