import { Router } from 'express';
import { permissionController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', permissionController.getPermissions.bind(permissionController));
router.get('/:id', permissionController.getPermissionById.bind(permissionController));
router.post('', requireAdmin, permissionController.createPermission.bind(permissionController));
router.put('/:id', requireAdmin, permissionController.updatePermission.bind(permissionController));
router.delete('/:id', requireAdmin, permissionController.inactivePermission.bind(permissionController));

export default router;
