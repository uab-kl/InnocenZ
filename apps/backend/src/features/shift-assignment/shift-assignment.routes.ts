import { Router } from 'express';
import { shiftAssignmentController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Assigning PRs to shifts is an agency (or admin) function; scoping to the
// caller's own agency is enforced in the controller.
router.use(requireRole('admin', 'agency'));

router.get('/', shiftAssignmentController.list.bind(shiftAssignmentController));
router.get('/:id', shiftAssignmentController.getById.bind(shiftAssignmentController));
router.post('/', shiftAssignmentController.create.bind(shiftAssignmentController));
router.put('/:id', shiftAssignmentController.update.bind(shiftAssignmentController));
router.delete('/:id', shiftAssignmentController.remove.bind(shiftAssignmentController));

export default router;
