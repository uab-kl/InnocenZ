import { Router } from 'express';
import { adminRequestController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

// Outlets/agencies submit requests; only admin can list/action the inbox.
router.post('/', adminRequestController.create.bind(adminRequestController));

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
