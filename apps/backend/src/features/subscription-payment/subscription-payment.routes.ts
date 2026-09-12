import { Router } from 'express';
import { subscriptionPaymentController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import {
  attachOrgOwnerPayer,
  orgOwnerPaysOnly,
} from '@/middlewares/require-sub-role.js';

/**
 * TWO ROUTERS, AND THE SPLIT IS THE WHOLE POINT.
 *
 * `v1Router.use(authenticateJWT)` gates everything mounted after it, and a
 * payment gateway holds no session and never will — so a webhook mounted with
 * the authenticated reads is a webhook that 401s every genuine delivery. The
 * WhatsApp webhook already dodges this by mounting above that line; this one
 * has to be mounted there too, which it cannot be while it shares a router with
 * routes that DO need a session.
 *
 * Exported separately rather than split into another file so the two stay side
 * by side: the reason they are apart is only legible when you can see both.
 */
export const subscriptionPaymentWebhookRouter = Router();

/**
 * NO GUARD, DELIBERATELY. The signature over the raw body IS the
 * authentication, and the controller verifies it before reading a single
 * field. It must be mounted BEFORE `authenticateJWT` in the v1 router.
 */
subscriptionPaymentWebhookRouter.post(
  '/:gateway',
  subscriptionPaymentController.handleWebhook.bind(subscriptionPaymentController),
);

const router = Router();

/**
 * The payer ticked periods and pressed Pay. Payers only — an admin marks
 * money received, it does not pay on a venue's behalf. Ownership of every
 * invoice is checked inside against the session, never taken from the body.
 */
/*
 * ⚠️ `requireRole('agency', 'outlet')` ALONE was not enough, and this is money.
 * It admits every lane on both portals, so an outlet Finance head, Ops Head or
 * Director could tick overdue periods and start a real FPX checkout — the UI
 * offered it too, because the button carried no permission check at all.
 * "These invoices belong to your organisation" is a different question from
 * "you may spend its money", and only the first was being asked.
 *
 * `orgOwnerPaysOnly` asks the second: the OWNER of the organisation actually
 * being acted for — owner's rule, 11 Sep 2026.
 *
 * ⚠️ This note used to read "owner or guarantor (the stand-in folds into
 * owner)". That was true of the guard when it was written and is not true now:
 * the owner narrowed it on 12 Sep — "guarantor no payment made like other
 * member just see paid and unpaid" — and `orgOwnerPaysOnly` passes
 * `foldGuarantor: false` for exactly that. Money is the one place the stand-in
 * does not stand in.
 */
router.post(
  '/checkout',
  requireRole('agency', 'outlet'),
  orgOwnerPaysOnly,
  subscriptionPaymentController.checkout.bind(subscriptionPaymentController),
);

/** Which providers are wired. Empty today; the admin UI reads it to say so. */
router.get(
  '/gateways',
  requireAdmin,
  subscriptionPaymentController.gateways.bind(subscriptionPaymentController),
);

/**
 * The attempts behind one invoice. Not admin-only — a venue asking "did my
 * payment go through" is asking about itself — and the controller resolves
 * ownership from the invoice against the session, so no org id is accepted
 * from the caller.
 *
 * ⚠️ `attachOrgOwnerPayer` REFUSES NOBODY — it records whether this caller is
 * the org's owner so the handler can withhold ONE field.
 *
 * Every member may read this; only the owner may see the instrument. The
 * handler used to ship `methods` — brand, last four, expiry, holder — to
 * whoever asked, reaching past the five `orgOwnerPaysOnly` guards on
 * `/payment-method` into the same repository. Owner, 12 Sep 2026: everyone
 * else "just see paid and unpaid".
 */
router.get(
  '/invoice/:invoiceId',
  requireRole('admin', 'agency', 'outlet'),
  attachOrgOwnerPayer,
  subscriptionPaymentController.listForInvoice.bind(subscriptionPaymentController),
);

export default router;
