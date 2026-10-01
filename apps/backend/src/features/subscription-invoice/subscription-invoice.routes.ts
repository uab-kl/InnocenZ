import { Router } from 'express';
import { subscriptionInvoiceController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';

const router = Router();

// An org reads its OWN invoices — that is the payment history on its
// Subscription screen. The guard alone is not the scope: the controller
// overwrites the subscriber filter from the session, because a role check that
// never looks at the org is not a scope check.
const canRead = requireRole('admin', 'agency', 'outlet');

// Static path BEFORE '/:id', or the parameterised route swallows the literal.
router.post(
  '/generate',
  requireAdmin,
  subscriptionInvoiceController.generate.bind(subscriptionInvoiceController),
);
router.get('/', canRead, subscriptionInvoiceController.list.bind(subscriptionInvoiceController));
router.get(
  '/:id',
  canRead,
  subscriptionInvoiceController.getById.bind(subscriptionInvoiceController),
);
// Voiding a bill raised in error (owner, 29 Sep 2026: "Add Void") is InnocenZ's
// call too — with a reason, and only on a bill nothing has touched. PATCH, so
// the platform audit records it as an UPDATE with the row it replaced.
router.patch(
  '/:id/void',
  requireAdmin,
  subscriptionInvoiceController.voidInvoice.bind(subscriptionInvoiceController),
);
// Marking money received is InnocenZ's call, never the payer's.
router.put(
  '/:id',
  requireAdmin,
  subscriptionInvoiceController.update.bind(subscriptionInvoiceController),
);

export default router;
