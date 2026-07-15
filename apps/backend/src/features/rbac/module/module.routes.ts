import { Router } from 'express';
import { moduleController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', moduleController.getModules.bind(moduleController));
router.get('/:id', moduleController.getModuleById.bind(moduleController));
router.post('', requireAdmin, moduleController.createModule.bind(moduleController));
router.put('/:id', requireAdmin, moduleController.updateModule.bind(moduleController));
router.delete('/:id', requireAdmin, moduleController.inactiveModule.bind(moduleController));

export default router;
