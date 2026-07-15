import { Router } from 'express';
import { limitTypeController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', limitTypeController.getLimitTypes.bind(limitTypeController));
router.get('/:id', limitTypeController.getLimitTypeById.bind(limitTypeController));
router.post('', requireAdmin, limitTypeController.createLimitType.bind(limitTypeController));
router.put('/:id', requireAdmin, limitTypeController.updateLimitType.bind(limitTypeController));
router.delete('/:id', requireAdmin, limitTypeController.inactiveLimitType.bind(limitTypeController));

export default router;
