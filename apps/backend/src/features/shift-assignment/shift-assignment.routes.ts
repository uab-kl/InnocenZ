import { Router } from 'express';
import { shiftAssignmentController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Assigning PRs to shifts is an agency (or admin) function. Outlets may READ the
// roster of shifts at their own venues — the controller pins them to their
// outlet set, so the wider role here never widens the data they can see.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');

router.get('/', canRead, shiftAssignmentController.list.bind(shiftAssignmentController));
router.get('/:id', canRead, shiftAssignmentController.getById.bind(shiftAssignmentController));
router.post('/', canWrite, shiftAssignmentController.create.bind(shiftAssignmentController));
router.put('/:id', canWrite, shiftAssignmentController.update.bind(shiftAssignmentController));
router.delete('/:id', canWrite, shiftAssignmentController.remove.bind(shiftAssignmentController));

export default router;
