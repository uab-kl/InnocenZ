import { Router } from 'express';
import { userRoleController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', userRoleController.listUserRoles.bind(userRoleController));
router.post('', requireAdmin, userRoleController.createUserRole.bind(userRoleController));
router.put('', requireAdmin, userRoleController.updateUserRole.bind(userRoleController));
// The counterpart POST never had. Without it a granted role was permanent, and
// since an account could not be deleted or disabled either, so was the person
// holding it. Body-addressed rather than by row id, because the caller knows who
// and which role — not the id of the join row.
router.delete('', requireAdmin, userRoleController.revokeUserRole.bind(userRoleController));

export default router;
