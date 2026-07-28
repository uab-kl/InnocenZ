import { Router } from 'express';
import { specialServiceController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('/summary', specialServiceController.statusSummary.bind(specialServiceController));
router.get(
  '/admin/pending',
  requireAdmin,
  specialServiceController.listAdminPending.bind(specialServiceController),
);
router.get('/', specialServiceController.list.bind(specialServiceController));
router.get('/mine', specialServiceController.listMine.bind(specialServiceController));
router.get('/:id', specialServiceController.getById.bind(specialServiceController));
// Creating stays open to every signed-in role — outlets, agencies and PRs all
// post special services — but the controller now pins `initiatedBy` to what the
// caller actually is, since that field decides whether a posting needs admin
// review.
router.post('/', specialServiceController.create.bind(specialServiceController));
// Assigning a vendor and moving an order's status are admin acts, matching the
// admin-only PATCH routes below. Both carried no gate and neither controller
// method checks ownership — they update by id alone, so any signed-in account
// could vendor-assign or complete/cancel any order in the platform. No client
// calls assign at all, and the only caller of status is the admin screen
// (routes/admin/service/other.tsx); audit_logs agrees — all 10 status updates on
// record were made by an admin.
router.patch('/:id/assign', requireAdmin, specialServiceController.assign.bind(specialServiceController));
router.patch('/:id/status', requireAdmin, specialServiceController.updateStatus.bind(specialServiceController));
router.patch('/:id', requireAdmin, specialServiceController.update.bind(specialServiceController));
router.patch(
  '/:id/admin-approve',
  requireAdmin,
  specialServiceController.adminApprove.bind(specialServiceController),
);
router.patch(
  '/:id/admin-decline',
  requireAdmin,
  specialServiceController.adminDecline.bind(specialServiceController),
);

export default router;
