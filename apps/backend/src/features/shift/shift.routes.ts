import { Router } from 'express';
import { shiftController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Shift management is an agency (or admin) function; scoping to the caller's
// own agency is enforced in the controller.
router.use(requireRole('admin', 'agency'));

router.get('/', shiftController.list.bind(shiftController));
router.get('/:id', shiftController.getById.bind(shiftController));
router.post('/', shiftController.create.bind(shiftController));
router.put('/:id', shiftController.update.bind(shiftController));
router.delete('/:id', shiftController.remove.bind(shiftController));

export default router;
