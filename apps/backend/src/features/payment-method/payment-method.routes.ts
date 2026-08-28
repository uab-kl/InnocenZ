import { Router } from 'express';
import { requirePermission } from '@/middlewares/require-permission.js';
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
/**
 * The FPX bank roster for the picker. Any signed-in payer may read it — it is a
 * public list of banks, not anyone's data.
 */
router.get(
  '/banks',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.banks.bind(paymentMethodController),
);
/** The e-wallet roster, on the same terms as `/banks`: a public list, not data. */
router.get(
  '/wallets',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.wallets.bind(paymentMethodController),
);
/** Every rail the org holds, default first — against `/mine`, which is the default alone. */
router.get(
  '/mine/all',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.listMine.bind(paymentMethodController),
);
router.put(
  '/mine',
  requireRole('outlet', 'agency', 'admin'),
  // The org billing method is a settings write. requireRole alone admitted any
  // member of either portal, so a view-only Director could replace it. The
  // module is seeded on BOTH portals and userHasPermission resolves each
  // caller against their own, so one guard covers agency and outlet correctly.
  requirePermission('settings', 'update'),
  paymentMethodController.upsertMine.bind(paymentMethodController),
);
// Choosing which instrument is charged, and retiring one, are the same class of
// settings write as saving one — same guard, deliberately.
router.put(
  '/mine/:id/default',
  requireRole('outlet', 'agency', 'admin'),
  requirePermission('settings', 'update'),
  paymentMethodController.setDefaultMine.bind(paymentMethodController),
);
router.delete(
  '/mine/:id',
  requireRole('outlet', 'agency', 'admin'),
  requirePermission('settings', 'update'),
  paymentMethodController.removeMine.bind(paymentMethodController),
);

router.get('/', requireAdmin, paymentMethodController.list.bind(paymentMethodController));

export default router;
