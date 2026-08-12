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
// Creating AND EDITING a shift is OUTLET-only (plus admin): the venue owns its
// own demand. It posts the job to the agency named by `onboarded_by_agency_id`,
// and the agency RECEIVES it — it does not author it, and does not get to
// rewrite the headcount or the hours afterwards. Agencies still read shifts and
// staff them; staffing is `shift-assignment`, a different resource.
//
// `canWrite` used to cover PUT and DELETE together and included `agency`, on the
// reasoning that PUT was for "roster edits" — but roster edits are assignments,
// not shifts, and no agency screen has ever called PUT /shift: the only caller in
// the whole web app is the outlet's own OutletShiftDetailPanel.
// Agencies READ shifts and staff them (`shift-assignment`); they never author,
// edit or remove one. All three writes are outlet-only, plus admin.
const canRead = requireRole('admin', 'agency', 'outlet');
const canCreate = requireRole('admin', 'outlet');
const canUpdate = requireRole('admin', 'outlet');
const canDelete = requireRole('admin', 'outlet');

router.get('/', canRead, shiftController.list.bind(shiftController));
router.get('/:id', canRead, shiftController.getById.bind(shiftController));
// Posting a job is outletCan('postJob'), which Outlet Finance does not hold.
router.post('/', canCreate, outletOwnerOrOps, shiftController.create.bind(shiftController));
router.put('/:id', canUpdate, shiftController.update.bind(shiftController));
router.delete('/:id', canDelete, shiftController.remove.bind(shiftController));

export default router;
