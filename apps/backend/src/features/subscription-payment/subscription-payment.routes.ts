import { Router } from 'express';
import { subscriptionPaymentController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';

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
 */
router.get(
  '/invoice/:invoiceId',
  requireRole('admin', 'agency', 'outlet'),
  subscriptionPaymentController.listForInvoice.bind(subscriptionPaymentController),
);

export default router;
