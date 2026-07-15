import { Router } from 'express';
import { rolePermissionController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', rolePermissionController.getRolePermissions.bind(rolePermissionController));
router.post('', requireAdmin, rolePermissionController.assignPermissionsToRole.bind(rolePermissionController));
router.put(
  '/update/:roleId',
  requireAdmin,
  rolePermissionController.updateRolePermissions.bind(rolePermissionController),
);
router.delete(
  '/:roleId',
  requireAdmin,
  rolePermissionController.removeAllPermissionsFromRole.bind(rolePermissionController),
);

export default router;
