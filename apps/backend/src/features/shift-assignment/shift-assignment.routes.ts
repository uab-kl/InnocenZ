import { Router } from 'express';
import { shiftAssignmentController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { agencyOwnerOnly } from '@/middlewares/require-sub-role.js';

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
router.get('/:id', canRead, shiftAssignmentController.getById.bind(shiftAssignmentController));
// Ranked replacement PRs for a released assignment; assigning the pick goes
// through the normal POST '/' below.
router.get('/:id/replacement-candidates', canWrite, shiftAssignmentController.listReplacementCandidatesForAssignment.bind(shiftAssignmentController));
// Agency decision on a pending MC/leave request (scoped to its own rows in the
// controller): approve excuses the PR, reject puts the row back to assigned.
router.post('/:id/leave/approve', canWrite, shiftAssignmentController.approveLeave.bind(shiftAssignmentController));
router.post('/:id/leave/reject', canWrite, shiftAssignmentController.rejectLeave.bind(shiftAssignmentController));
// Rostering is agencyCan('assignShifts'), which Agency Finance does not hold —
// so the org-level `canWrite` is not enough on its own. Admin passes the
// sub-role guard by design.
router.post('/', canWrite, agencyOwnerOnly, shiftAssignmentController.create.bind(shiftAssignmentController));
router.put('/:id', canWrite, agencyOwnerOnly, shiftAssignmentController.update.bind(shiftAssignmentController));
router.delete('/:id', canWrite, agencyOwnerOnly, shiftAssignmentController.remove.bind(shiftAssignmentController));

export default router;
