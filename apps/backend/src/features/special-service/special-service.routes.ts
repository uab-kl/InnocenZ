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
router.post('/', specialServiceController.create.bind(specialServiceController));
router.patch('/:id/assign', specialServiceController.assign.bind(specialServiceController));
router.patch('/:id/status', specialServiceController.updateStatus.bind(specialServiceController));
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
