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
// A signed-in PR reads only its own assignments (scoped server-side by pr.id),
// so this sits outside the agency/outlet canRead guard. Must precede '/:id'.
router.get('/mine', shiftAssignmentController.listMine.bind(shiftAssignmentController));
// A signed-in PR stamps attendance on its OWN assignment — scoped server-side by
// pr.id, so these sit outside the agency/admin canWrite guard.
router.post('/mine/:id/check-in', shiftAssignmentController.checkInMine.bind(shiftAssignmentController));
router.post('/mine/:id/check-out', shiftAssignmentController.checkOutMine.bind(shiftAssignmentController));
// A signed-in PR cancels its OWN upcoming assignment (reason required) — the
// agency sees the cancelled row. Also outside the agency/admin canWrite guard.
router.post('/mine/:id/cancel', shiftAssignmentController.cancelMine.bind(shiftAssignmentController));
router.get('/:id', canRead, shiftAssignmentController.getById.bind(shiftAssignmentController));
router.post('/', canWrite, shiftAssignmentController.create.bind(shiftAssignmentController));
router.put('/:id', canWrite, shiftAssignmentController.update.bind(shiftAssignmentController));
router.delete('/:id', canWrite, shiftAssignmentController.remove.bind(shiftAssignmentController));

export default router;
