import { Router } from 'express';
import { outletSwapController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';

const router = Router();

// Raising and withdrawing a swap is an agency (or admin) function. Outlets are
// not readers: a swap is an agency↔PR negotiation, and the venue only ever sees
// the roster it settles into.
const canManage = requireRole('admin', 'agency');

// The PR side is scoped server-side by pr.id, so it sits outside canManage —
// same arrangement as shift-assignment's '/mine' routes. All of these must
// precede '/:id' so 'mine' is never read as an id.
router.get('/mine', outletSwapController.listMine.bind(outletSwapController));
router.post('/mine/:id/approve', outletSwapController.approveMine.bind(outletSwapController));
router.post('/mine/:id/decline', outletSwapController.declineMine.bind(outletSwapController));

// Candidate destination shifts for one assignment, with live headcount.
router.get('/targets', canManage, outletSwapController.listTargets.bind(outletSwapController));

router.get('/', canManage, outletSwapController.list.bind(outletSwapController));
router.post('/', canManage, requirePermission('roster', 'update'), outletSwapController.create.bind(outletSwapController));
router.post('/:id/cancel', canManage, requirePermission('roster', 'update'), outletSwapController.cancel.bind(outletSwapController));

export default router;
