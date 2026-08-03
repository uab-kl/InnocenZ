import { Router } from 'express';
import { paymentMethodController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';

const router = Router();

/**
 * A subscriber's OWN card. Not behind requireAdmin — the venue/agency is asking
 * about itself — and the owner is resolved from the session, so no organisation
 * id is accepted from the body. `/mine` sits before the admin list for the same
 * reason it does on admin-request: a literal path must not be shadowed.
 */
router.get(
  '/mine',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.getMine.bind(paymentMethodController),
);
router.put(
  '/mine',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.upsertMine.bind(paymentMethodController),
);

router.get('/', requireAdmin, paymentMethodController.list.bind(paymentMethodController));

export default router;
