import { Router } from 'express';
import { shiftController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Outlets both READ the shifts booked at their own venues and WRITE new ones —
// posting a job and requesting PR from a chosen agency is their primary use of
// the app. The controller pins every caller to its own org, so the shared role
// here never widens the data an outlet can see or touch.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency', 'outlet');

router.get('/', canRead, shiftController.list.bind(shiftController));
router.get('/:id', canRead, shiftController.getById.bind(shiftController));
router.post('/', canWrite, shiftController.create.bind(shiftController));
router.put('/:id', canWrite, shiftController.update.bind(shiftController));
router.delete('/:id', canWrite, shiftController.remove.bind(shiftController));

export default router;
