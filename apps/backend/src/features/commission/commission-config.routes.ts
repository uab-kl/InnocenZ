import { Router } from 'express';
import { commissionConfigController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('/', commissionConfigController.list.bind(commissionConfigController));
router.get('/:id', commissionConfigController.getById.bind(commissionConfigController));
router.post('/', requireAdmin, commissionConfigController.upsert.bind(commissionConfigController));
router.put('/:id', requireAdmin, commissionConfigController.update.bind(commissionConfigController));
router.delete('/:id', requireAdmin, commissionConfigController.remove.bind(commissionConfigController));

export default router;
