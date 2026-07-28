import { Router } from 'express';
import { shiftController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { outletOwnerOrOps } from '@/middlewares/require-sub-role.js';

const router = Router();

// Outlets both READ the shifts booked at their own venues and WRITE new ones —
// posting a job and requesting PR from a chosen agency is their primary use of
// the app. The controller pins every caller to its own org, so the shared role
// here never widens the data an outlet can see or touch.
//
// Creating a shift is OUTLET-only (plus admin): the outlet posts the job and
// requests PR from its agency. Agencies never author shifts — they only assign
// PRs and adjust the roster — so `agency` is excluded from POST while it stays
// on PUT/DELETE for roster edits.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency', 'outlet');
const canCreate = requireRole('admin', 'outlet');

router.get('/', canRead, shiftController.list.bind(shiftController));
router.get('/:id', canRead, shiftController.getById.bind(shiftController));
// Posting a job is outletCan('postJob'), which Outlet Finance does not hold.
router.post('/', canCreate, outletOwnerOrOps, shiftController.create.bind(shiftController));
router.put('/:id', canWrite, shiftController.update.bind(shiftController));
router.delete('/:id', canWrite, shiftController.remove.bind(shiftController));

export default router;
