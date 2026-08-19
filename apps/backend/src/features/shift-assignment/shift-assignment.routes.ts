import { Router } from 'express';
import { shiftAssignmentController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { agencyOwnerOnly, agencyOwnerOrFinance } from '@/middlewares/require-sub-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';

const router = Router();

// Assigning PRs to shifts is an agency (or admin) function. Outlets may READ the
// roster of shifts at their own venues — the controller pins them to their
// outlet set, so the wider role here never widens the data they can see.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');
// Where a worker physically stood is narrower than the roster: outlets are left
// OUT even for their own venues, because that is a privacy call about staff
// coordinates rather than the usual tenant-scoping question.
const canReadPositions = requireRole('admin', 'agency');

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
// A signed-in PR files an MC/leave request on its OWN assignment (reason
// required) — goes to leave_pending until the agency decides below.
router.post('/mine/:id/leave', shiftAssignmentController.requestLeaveMine.bind(shiftAssignmentController));
// Agency backfill worklist — released (cancelled / leave-approved) slots on
// upcoming shifts still below quantity. Must precede '/:id'.
router.get('/backfill', canWrite, shiftAssignmentController.listBackfill.bind(shiftAssignmentController));
// Attendance position snapshots for one date. NOT called '/live': the fixes are
// stamped at check-in and check-out only, so a live-sounding path would promise
// tracking the system does not do. Must precede '/:id'.
router.get('/attendance-fixes', canReadPositions, shiftAssignmentController.listAttendanceFixes.bind(shiftAssignmentController));
// Overtime claims awaiting a decision. READ is open to the whole agency (and
// admin) — seeing what is holding a payroll week is not the same authority as
// deciding it — but the outlet is left out, as it is for positions: a venue
// does not review the agency's pay decisions. Must precede '/:id'.
router.get('/overtime/pending', canWrite, shiftAssignmentController.listPendingOvertime.bind(shiftAssignmentController));
// What one PR would earn on each of several shifts, before assigning them.
// `canWrite`, not `canRead`: it answers a question only the people who staff the
// roster ask, and it discloses the outlet's rate card for a tier. Must precede
// '/:id', which would otherwise swallow 'wage-preview' as an assignment id.
router.get('/wage-preview', canWrite, shiftAssignmentController.wagePreview.bind(shiftAssignmentController));
router.get('/:id', canRead, shiftAssignmentController.getById.bind(shiftAssignmentController));
// Ranked replacement PRs for a released assignment; assigning the pick goes
// through the normal POST '/' below.
router.get('/:id/replacement-candidates', canWrite, shiftAssignmentController.listReplacementCandidatesForAssignment.bind(shiftAssignmentController));
// Agency decision on a pending MC/leave request (scoped to its own rows in the
// controller): approve excuses the PR, reject puts the row back to assigned.
router.post('/:id/leave/approve', canWrite, requirePermission('approvals', 'update'), shiftAssignmentController.approveLeave.bind(shiftAssignmentController));
router.post('/:id/leave/reject', canWrite, requirePermission('approvals', 'update'), shiftAssignmentController.rejectLeave.bind(shiftAssignmentController));
// Deciding overtime IS raising money onto a payment voucher, so it takes the
// same sub-role as the rest of the PV attestation surface — agencyCan('raisePv')
// = owner + finance — rather than `agencyOwnerOnly`, which would shut finance
// out of a payroll decision. Admin passes the sub-role guard by design.
router.patch('/:id/overtime', canWrite, agencyOwnerOrFinance, shiftAssignmentController.decideOvertime.bind(shiftAssignmentController));
// Rostering is agencyCan('assignShifts'), which Agency Finance does not hold —
// so the org-level `canWrite` is not enough on its own. Admin passes the
// sub-role guard by design.
router.post('/', canWrite, agencyOwnerOnly, shiftAssignmentController.create.bind(shiftAssignmentController));
router.put('/:id', canWrite, agencyOwnerOnly, shiftAssignmentController.update.bind(shiftAssignmentController));
router.delete('/:id', canWrite, agencyOwnerOnly, shiftAssignmentController.remove.bind(shiftAssignmentController));

export default router;
