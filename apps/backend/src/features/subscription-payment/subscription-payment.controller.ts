import { Request, Response } from 'express';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import {
  type OrgScopeDeps,
  pickedOrgKind,
  resolveActingOrgId,
  resolveOrgScope,
} from '@/util/org-scope.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import type { PaymentMethodRepositoryClass } from '@/features/payment-method/payment-method.repository.js';
import { toPublicPaymentMethod } from '@/features/payment-method/payment-method.model.js';
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
      /*
       * ⚠️ THE INSTRUMENT IS THE OWNER'S ALONE — the rest of this payload is not.
       *
       * This route is open to every member on purpose: "did our payment go
       * through" is a fair question for anyone in the organisation, and the
       * ownership check above already proves the invoice is theirs. But the
       * card came with it. `GET /payment-method/mine` and its four siblings all
       * carry `orgOwnerPaysOnly`, and this handler reached past every one of
       * them into the same repository — so an outlet Director or an agency
       * Finance head opening a paid period was shown the brand, last four,
       * expiry and holder name of the card the organisation pays with. A guard
       * on five routes is not a rule while a sixth reads the rows directly.
       *
       * Owner, 12 Sep 2026: "guarantor no payment made like other member just
       * see paid and unpaid, owner make payment fpx and the payment method
       * continue." So the guarantor is refused here too — `resolveOrgOwnerPayer`
       * is the SAME call the middleware makes, with `foldGuarantor: false`.
       *
       * An empty array rather than a missing key: the panel maps over this, and
       * "no instrument saved" is a state it already renders. Everything else on
       * the response — whether each period is paid, when, and by whom — stays.
       *
       * ⚠️ `scope.isAdmin` STAYS. The rule the owner drew is about the
       * organisation's own members, not about platform support: `GET
       * /payment-method/` is `requireAdmin` precisely so an admin can answer
       * "which card is this venue on", and this sheet — `invoice-payment-sheet`
       * on `/admin/service/plan-payment` — is the ONLY screen that reads
       * `methods` at all. `resolveOrgOwnerPayer` answers 'refused' for an admin
       * holding no owner lane, so without this term the fix would have blanked
       * the one legitimate reader and left the leak's real audience unchanged.
       *
       * ⚠️ READ OFF `res.locals`, NOT imported. `require-sub-role.js` pulls its
       * repositories from `composition-root.js`, which constructs THIS
       * controller — importing it here would close the cycle, and that module
       * captures `orgScopeDeps` at evaluation time, so the deps would bind
       * `undefined` rather than fail loudly. `attachOrgOwnerPayer` runs on the
       * route, where the import is already safe. Absent (a route that forgot to
       * mount it) reads as not-the-payer, so the card stays hidden by default.
       */
      const isPayer = scope.isAdmin || res.locals.orgOwnerPayer === 'owner';
      // Read through the invoice's OWN subscriber, never through an org id from
      // the query — the scope check above is only a scope check if what comes
      // back belongs to the row that was checked.
      // Through the shared mapper like every other read: this is the FIFTH lane
      // that serialises an instrument, and the one a per-controller strip of
      // `gatewayToken` would have missed — it lives in a different feature.
      const methods = isPayer
        ? (
            await this.paymentMethodRepository.listFor(
              invoice.subscriberType === 'agency'
                ? { agencyId: invoice.subscriberId }
                : { outletId: invoice.subscriberId },
            )
          ).map(toPublicPaymentMethod)
        : [];

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

      /**
       * EVERY PERIOD THIS SUBSCRIBER HAS BEEN BILLED, paid and unpaid.
       *
       * The panel opens on ONE period and is where an admin decides whether to
       * mark it paid — a decision that needs the neighbours: is this the only
       * thing outstanding, or the fourth unpaid week in a row? Without it the
       * admin has to close the drawer, expand the org card, and come back.
       *
       * Scoped through the invoice's OWN subscriber, which the ownership check
       * above has already cleared — never from an id in the query, or this
       * would be a second, wider door onto another org's ledger.
       */
      const { records: history } = await this.invoiceRepository.listPaginated({
        filter: {
          subscriberType: invoice.subscriberType,
          subscriberId: invoice.subscriberId,
        },
        page: 1,
        // Generous but bounded: an agency bills weekly, so 100 is about two
        // years. A subscriber past that reads the oldest periods on the org
        // card, which pages properly.
        pageSize: 100,
      });

      // uuid -> display name, so the panel prints a person rather than an id.
      const actors = await this.repository.resolveActorNames(payments.map((p) => p.createdBy));

      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          invoice,
          payments,
          methods,
          org,
          lanes,
          history,
          actors,
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

  /**
   * THE PAYER TICKED SOME PERIODS AND PRESSED PAY.
   *
   * Everything that decides money is settled server-side: which invoices exist,
   * that every one belongs to the caller, that none is already paid, and what
   * they add up to. The browser sends ids and nothing else. One hosted session
   * is opened for the lot; one `pending` attempt is written per invoice, all
   * carrying the session's id, so the webhook can settle them together.
   *
   * With no gateway registered this answers 503 and says so — the honest state
   * until Fiuu is wired (runbook step 5) — rather than inventing a URL.
   */
  async checkout(req: Request, res: Response) {
    try {
      const raw = Array.isArray(req.body?.invoiceIds) ? (req.body.invoiceIds as unknown[]) : [];
      const invoiceIds = [...new Set(raw.filter((v): v is string => typeof v === 'string'))];
      if (invoiceIds.length === 0 || invoiceIds.length > 24) {
        return res.status(400).json({ success: false, message: 'Choose 1–24 periods', data: null });
      }

      const scope = await resolveOrgScope(req, this.orgScopeDeps);

      /*
       * ⚠️ AN ADMIN WHO OWNS AN ORGANISATION PAYS FOR THEIR OWN.
       *
       * `resolveOrgScope` short-circuits on admin and returns `agencyId: null,
       * outletIds: []`, so `owns` below was false for every invoice and this
       * answered 404 — "your own invoices do not exist". `orgOwnerPaysOnly`
       * already admits such an account (it checks the owner LANE at the acting
       * org), so the guard passed and the handler then refused: the earlier fix
       * had landed on one half only.
       *
       * ⚠️ NOT `scope.isAdmin ||`. That would let ANY admin start an FPX
       * checkout against ANY organisation's invoices — admin-ness must open
       * nothing on its own. Instead the ACTING org is resolved the same way the
       * guard resolves it, from the verified `x-org-id` + `x-org-kind`, and the
       * invoice is matched against that one organisation.
       */
      let adminAgencyId: string | null = null;
      let adminOutletIds: string[] = [];
      if (scope.isAdmin) {
        const kind = pickedOrgKind(req);
        for (const org of (kind ? [kind] : ['agency', 'outlet']) as Array<
          'agency' | 'outlet'
        >) {
          const orgId = await resolveActingOrgId(req, this.orgScopeDeps, org);
          if (!orgId) continue;
          if (org === 'agency') adminAgencyId = orgId;
          else adminOutletIds = [orgId];
          break;
        }
      }
      const ownAgencyId = scope.isAdmin ? adminAgencyId : scope.agencyId;
      const ownOutletIds = scope.isAdmin ? adminOutletIds : scope.outletIds;

      const invoices = [];
      for (const id of invoiceIds) {
        const invoice = await this.invoiceRepository.getById(id);
        const owns =
          invoice &&
          ((invoice.subscriberType === 'agency' && invoice.subscriberId === ownAgencyId) ||
            (invoice.subscriberType === 'outlet' && ownOutletIds.includes(invoice.subscriberId)));
        // Someone else's invoice is a 404, never a 403 — do not confirm it exists.
        if (!owns) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
        if (invoice.status === 'paid') {
          return res.status(409).json({
            success: false,
            message: `${invoice.invoiceNo} is already paid`,
            data: null,
          });
        }
        invoices.push(invoice);
      }
      const currency = invoices[0].currency;
      if (invoices.some((invoice) => invoice.currency !== currency)) {
        return res.status(400).json({ success: false, message: 'Mixed currencies', data: null });
      }
      // Integer cents, never float addition, for the same reason as everywhere
      // else money is summed in this codebase.
      const totalCents = invoices.reduce((sum, invoice) => sum + Math.round(Number(invoice.amount) * 100), 0);
      const totalAmount = (totalCents / 100).toFixed(2);

      const [gatewayName] = listGateways();
      const gateway = gatewayName ? getGateway(gatewayName) : null;
      if (!gateway) {
        return res.status(503).json({
          success: false,
          message: 'Online payment is not connected yet — InnocenZ will mark this period paid once your transfer arrives.',
          data: { totalAmount, currency, invoiceIds },
        });
      }

      const first = invoices[0];
      const owner =
        first.subscriberType === 'agency'
          ? { agencyId: first.subscriberId }
          : { outletId: first.subscriberId };
      const instrument = await this.paymentMethodRepository.getActiveFor(owner);
      const org = await this.repository.getOrgProfile(first.subscriberType, first.subscriberId);
      const reference = `chk_${first.subscriberId.slice(0, 8)}_${Date.now().toString(36)}`;
      const session = await gateway.createCheckout({
        reference,
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          amount: invoice.amount,
          currency: invoice.currency,
        })),
        totalAmount,
        currency,
        payer: { name: org?.name ?? first.subscriberName, email: instrument?.billingEmail ?? null },
        returnUrl: `${env.FRONTEND_URL ?? ''}/${first.subscriberType}/subscription?checkout=returned`,
      });

      const actor = getActor(req);
      for (const invoice of invoices) {
        await this.repository.recordAttempt({
          subscriptionInvoiceId: invoice.id,
          // A manual pay-now is ALWAYS one-off FPX (owner, 2 Sep 2026): it is
          // the road for an org with nothing saved AND for one whose direct
          // debit just bounced, so the attempt must not claim the instrument
          // that failed to pay. The saved row still lends its billing email.
          methodType: 'fpx',
          paymentMethodId: null,
          gateway: gateway.name,
          gatewayPaymentId: session.gatewayPaymentId,
          reference,
          outcome: 'pending',
          actor,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Checkout opened',
        data: { payUrl: session.payUrl, totalAmount, currency, invoiceIds },
      });
    } catch (error) {
      logger.error('[SubscriptionPaymentController.checkout] Error:', error);
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

      /**
       * WHICH INSTRUMENT PAID, resolved rather than guessed.
       *
       * `event.methodType ?? 'card'` stamped "card" on every delivery that did
       * not name a rail — including settlements for orgs that hold no card at
       * all and pay by FPX mandate, so the attempt trail claimed a rail the
       * venue has never used. And `paymentMethodId` was never written by either
       * settle path, leaving the foreign key 0133 added permanently NULL.
       *
       * Both answers live on the org's default instrument, so both are read
       * from it when the gateway does not say. Still null-safe: an org may hold
       * no instrument, and `manual_transfer` is the honest fallback for money
       * that arrived through no instrument this app knows about — which is
       * exactly what the column's own migration comment describes.
       */
      const invoice = await this.invoiceRepository.getById(event.subscriptionInvoiceId);
      const instrument = invoice
        ? await this.paymentMethodRepository.getActiveFor(
            invoice.subscriberType === 'agency'
              ? { agencyId: invoice.subscriberId }
              : { outletId: invoice.subscriberId },
          )
        : null;

      // ONE call for every outcome. A failed or still-pending attempt is exactly
      // what `subscription_payment` exists to hold — dropping it is how a venue
      // gets chased with no record of the three declines behind it — and the
      // amount is read from the invoice in both cases, never from the body.
      // A checkout session can cover several ticked periods (0146). When the
      // provider names the session rather than a single invoice, every period
      // opened under that session is settled — or declined — together.
      const invoiceIds = event.subscriptionInvoiceId
        ? [event.subscriptionInvoiceId]
        : await this.repository.invoiceIdsForGatewayPayment(gateway.name, event.gatewayPaymentId);
      if (invoiceIds.length === 0) {
        logger.error(
          `[subscription-payment] ${gateway.name} reported session ${event.gatewayPaymentId} with no invoices behind it`,
        );
        return res.status(200).json({ success: true, message: 'Ignored', data: null });
      }

      let result: Awaited<ReturnType<typeof this.repository.recordAttempt>> = {
        ok: false,
        reason: 'invoice_not_found',
      };
      for (const invoiceId of invoiceIds) {
        result = await this.repository.recordAttempt({
          subscriptionInvoiceId: invoiceId,
          methodType: event.methodType ?? instrument?.type ?? 'manual_transfer',
          paymentMethodId: instrument?.id ?? null,
          gateway: gateway.name,
          gatewayPaymentId: event.gatewayPaymentId,
          reference: event.reference ?? null,
          failureReason: event.failureReason ?? null,
          outcome: event.outcome,
          paidAt: event.paidAt,
          actor: `gateway:${gateway.name}`,
        });
        if (!result.ok && result.reason === 'error') break;
      }

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
