import { Router } from 'express';
import { roleController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', roleController.getRoles.bind(roleController));
router.get('/:id', roleController.getRoleById.bind(roleController));
router.post('', requireAdmin, roleController.createRole.bind(roleController));
router.put('/:id', requireAdmin, roleController.updateRole.bind(roleController));
router.put('/inactive/:id', requireAdmin, roleController.inactiveRole.bind(roleController));

export default router;
