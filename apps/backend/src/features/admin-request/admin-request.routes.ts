import { Router } from 'express';
import { adminRequestController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Outlets/agencies submit requests; only admin can list/action the inbox.
router.post('/', adminRequestController.create.bind(adminRequestController));

/**
 * A subscriber's OWN outstanding plan change. Deliberately NOT behind
 * requireAdmin — it is the venue/agency asking about itself — and placed before
 * `/:id` so the literal path is not swallowed by the admin-only id route. The
 * controller scopes it from the session, so no id is accepted from the client.
 */
router.get(
  '/mine/plan-change',
  requireRole('outlet', 'agency', 'admin'),
  adminRequestController.myLatestPlanChange.bind(adminRequestController),
);
router.get(
  '/mine/pos-quote',
  requireRole('outlet', 'agency', 'admin'),
  adminRequestController.myLatestPosQuote.bind(adminRequestController),
);

router.get('/pending-count', requireAdmin, adminRequestController.pendingCount.bind(adminRequestController));
router.get(
  '/negotiated-summary',
  requireAdmin,
  adminRequestController.negotiatedSummary.bind(adminRequestController),
);
router.get('/', requireAdmin, adminRequestController.list.bind(adminRequestController));
router.get('/:id', requireAdmin, adminRequestController.getById.bind(adminRequestController));
router.patch('/:id/contacted', requireAdmin, adminRequestController.markContacted.bind(adminRequestController));
router.patch('/:id/resolve', requireAdmin, adminRequestController.resolve.bind(adminRequestController));
// Outlet plan-change approval flow (agency plan changes are 'direct' — no approval).
router.patch('/:id/approve', requireAdmin, adminRequestController.approve.bind(adminRequestController));
router.patch('/:id/decline', requireAdmin, adminRequestController.decline.bind(adminRequestController));
router.patch('/:id', requireAdmin, adminRequestController.update.bind(adminRequestController));

export default router;
