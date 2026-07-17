import { Router } from 'express';
import { prController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// PR personnel management is an agency (or admin) function; scoping to the
// caller's own agency is enforced in the controller.
router.use(requireRole('admin', 'agency'));

router.get('/', prController.list.bind(prController));
router.get('/:id', prController.getById.bind(prController));
router.post('/', prController.create.bind(prController));
router.put('/:id', prController.update.bind(prController));
router.delete('/:id', prController.remove.bind(prController));

export default router;
