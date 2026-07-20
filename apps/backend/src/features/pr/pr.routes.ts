import { Router } from 'express';
import { prController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// PR personnel management is an agency (or admin) function. Outlets may READ the
// PRs rostered at their own venues — the controller pins them to that set, so
// the wider role here never widens the data they can see.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');

router.get('/', canRead, prController.list.bind(prController));
router.get('/:id', canRead, prController.getById.bind(prController));
router.post('/', canWrite, prController.create.bind(prController));
router.put('/:id', canWrite, prController.update.bind(prController));
router.delete('/:id', canWrite, prController.remove.bind(prController));

export default router;
