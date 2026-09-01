import { Router } from 'express';
import { adminRequestController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';

const router = Router();

// Outlets/agencies submit requests; only admin can list/action the inbox.
router.post('/', requirePermission('settings', 'update'), adminRequestController.create.bind(adminRequestController));

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
// The agency's counterpart to the POS quote: joining Custom, re-agreeing its
// price and leaving it are all filed as 'custom_renegotiation'.
router.get(
  '/mine/custom-quote',
  requireRole('outlet', 'agency', 'admin'),
  adminRequestController.myLatestCustomQuote.bind(adminRequestController),
);

/**
 * Taking your own request back. The only WRITE on this inbox that is not the
 * admin's, so it sits with the `/mine` reads above `/:id` and outside
 * requireAdmin — a venue cancelling its own POS quote is acting on itself.
 *
 * The id in the path is NOT the authority: the controller re-derives the
 * caller's organisations from the session and answers 404 for anything outside
 * them, so a guessed uuid cannot cancel another venue's negotiation.
 */
router.patch(
  '/mine/:id/withdraw',
  requireRole('outlet', 'agency', 'admin'),
  // Same guard as saving a payment method: withdrawing a price negotiation is a
  // settings-class write, and requireRole alone would admit a view-only Director.
  requirePermission('settings', 'update'),
  adminRequestController.withdrawMine.bind(adminRequestController),
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
