import { Router } from 'express';
import { outletController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

// Outlet CRUD
router.get('/', outletController.list.bind(outletController));
router.get('/:id', outletController.getById.bind(outletController));
router.post('/', outletController.create.bind(outletController));
router.put('/:id', outletController.update.bind(outletController));
router.patch('/:id/geo-fence', outletController.setGeoFence.bind(outletController));
router.patch('/:id/approve', requireAdmin, outletController.approve.bind(outletController));
router.patch('/:id/suspend', requireAdmin, outletController.suspend.bind(outletController));

// Outlet members
router.get('/:id/members', outletController.listMembers.bind(outletController));
router.post('/:id/members', outletController.addMember.bind(outletController));
router.put('/:id/members/:memberId', outletController.updateMember.bind(outletController));
router.delete('/:id/members/:memberId', outletController.removeMember.bind(outletController));

export default router;
