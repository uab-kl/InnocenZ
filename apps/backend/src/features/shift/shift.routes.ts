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
// own demand. It posts the job to the agencies it picked from its APPROVED
// `agency_outlet` links (0123/0124) — never to `onboarded_by_agency_id`, which
// is provenance now — and each agency RECEIVES it: it does not author it, and does not get to
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
// The SAME lane guard as POST. `requireRole('outlet')` admits every outlet lane,
// so without this Finance and Director — who cannot post a job — could still
// confirm staffing or seal a night by calling the API directly. The client has
// always agreed with this: `confirmShift` and `sealShift` are held by exactly
// the lanes that hold `postJob` (owner + ops), and `postJob` IS
// `booking:create`, which is what `outletOwnerOrOps` checks. The gate was only
// ever missing on the server side.
router.put('/:id', canUpdate, outletOwnerOrOps, shiftController.update.bind(shiftController));
// Withdrawing is the mirror of posting, and the more consequential half: a
// delete CASCADES to shift_assignment and from there to swaps and cut-loss
// requests, so it cancels people. Same lane as POST and PUT.
router.delete('/:id', canDelete, outletOwnerOrOps, shiftController.remove.bind(shiftController));

export default router;
