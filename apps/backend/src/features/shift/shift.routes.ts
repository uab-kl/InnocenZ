import { Router } from 'express';
import { shiftController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Writing shifts is an agency (or admin) function. Outlets may READ the shifts
// booked at their own venues — the controller pins them to their outlet set, so
// the wider role here never widens the data they can see.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');

router.get('/', canRead, shiftController.list.bind(shiftController));
router.get('/:id', canRead, shiftController.getById.bind(shiftController));
router.post('/', canWrite, shiftController.create.bind(shiftController));
router.put('/:id', canWrite, shiftController.update.bind(shiftController));
router.delete('/:id', canWrite, shiftController.remove.bind(shiftController));

export default router;
