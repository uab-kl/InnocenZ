import { Router } from 'express';
import { prController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// PR personnel management is an agency (or admin) function. Outlets may READ the
// PRs rostered at their own venues — the controller pins them to that set, so
// the wider role here never widens the data they can see.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');

// PR-scoped self-service. Must sit above the role guards (a PR is none of the
// roles below) and above `/:id`, which would otherwise swallow "mine".
router.put('/mine/agencies', prController.updateMyAgencies.bind(prController));

router.get('/', canRead, prController.list.bind(prController));

// Proposed penalty deductions for a PR's week at one outlet. Read-only — it
// computes what COULD be charged and never touches a voucher; applying it is a
// deliberate agency act via PUT /payment-voucher/:id. Two segments, so it must
// precede '/:id' or that route swallows it.
router.get('/:id/penalties', canWrite, prController.getPenalties.bind(prController));

router.get('/:id', canRead, prController.getById.bind(prController));
router.post('/', canWrite, prController.create.bind(prController));
router.put('/:id', canWrite, prController.update.bind(prController));
router.delete('/:id', canWrite, prController.remove.bind(prController));

export default router;
