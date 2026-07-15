import { Router } from 'express';
import { userRoleController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', userRoleController.listUserRoles.bind(userRoleController));
router.post('', requireAdmin, userRoleController.createUserRole.bind(userRoleController));
router.put('', requireAdmin, userRoleController.updateUserRole.bind(userRoleController));

export default router;
