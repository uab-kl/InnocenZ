import { Router } from 'express';
import { shiftAssignmentController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { agencyOwnerOrFinance } from '@/middlewares/require-sub-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';
import { redactIdentityDocsForOutlet } from '@/middlewares/redact-identity-docs.js';

const router = Router();

// Assigning PRs to shifts is an agency (or admin) function. Outlets may READ the
// roster of shifts at their own venues — the controller pins them to their
// outlet set, so the wider role here never widens the data they can see.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');
// Where a worker physically stood is narrower than the roster: outlets are left
// OUT even for their own venues, because that is a privacy call about staff
// coordinates rather than the usual tenant-scoping question.
//
// ⚠️ THIS GATE WAS BEING WALKED AROUND BY THE ROUTE ABOVE IT. `attendance-fixes`
// was closed to outlets while `GET /` — same router, same rows — served
// `checkInLat`/`checkInLng` in full on 15 of 35 live rows, plus the PR's
// cancellation FINE. Gating the specialised endpoint and leaving the general
// list open is the shape of this whole class of bug: the decision gets enforced
// wherever somebody happened to be looking. `redactIdentityDocsForOutlet` now
// covers the list and `/:id`; a gate there would blank PR names on live outlet
// screens, which is why the fix is a shape.
const canReadPositions = requireRole('admin', 'agency');

router.get('/', canRead, redactIdentityDocsForOutlet, shiftAssignmentController.list.bind(shiftAssignmentController));
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
router.get('/:id', canRead, redactIdentityDocsForOutlet, shiftAssignmentController.getById.bind(shiftAssignmentController));
// Ranked replacement PRs for a released assignment; assigning the pick goes
// through the normal POST '/' below.
router.get('/:id/replacement-candidates', canWrite, shiftAssignmentController.listReplacementCandidatesForAssignment.bind(shiftAssignmentController));
// Agency decision on a pending MC/leave request (scoped to its own rows in the
// controller): approve excuses the PR, reject puts the row back to assigned.
router.post('/:id/leave/approve', canWrite, requirePermission('approvals', 'update'), shiftAssignmentController.approveLeave.bind(shiftAssignmentController));
router.post('/:id/leave/reject', canWrite, requirePermission('approvals', 'update'), shiftAssignmentController.rejectLeave.bind(shiftAssignmentController));
// Deciding overtime IS raising money onto a payment voucher, so it takes the
// same sub-role as the rest of the PV attestation surface — agencyCan('raisePv')
// = owner + finance — rather than an owner-only gate, which would shut finance
// out of a payroll decision. Admin holds the permission by design.
router.patch('/:id/overtime', canWrite, agencyOwnerOrFinance, shiftAssignmentController.decideOvertime.bind(shiftAssignmentController));
/*
 * ROSTERING ASKS THE DATABASE, NOT A HARD-CODED LANE LIST.
 *
 * Owner, 12 Sep 2026: "other agency orgs member can assign member, access
 * calander page, the rest of the page can view".
 *
 * These three were `agencyOwnerOnly` — a LANE guard naming 'owner' — while the
 * portal gates the same buttons on `assignShifts` = `roster:update`. Two
 * sources for one answer, and granting Finance the permission would have moved
 * only the screen: the button would appear and the server would still refuse.
 * The standing rule is that `role_permission` decides, so that is what they ask
 * now. Owner and Guarantor are unaffected (both hold `roster` RCU), admin holds
 * it too, and Director keeps READ only — so Director stays view-only.
 *
 * Assign, change and un-assign are ONE job and share one permission
 * deliberately: splitting them would let Finance roster somebody and then be
 * refused when correcting the mistake, and would put the matrix back in
 * disagreement with the server on two routes out of three.
 */
const canRoster = requirePermission('roster', 'update');
router.post('/', canWrite, canRoster, shiftAssignmentController.create.bind(shiftAssignmentController));
router.put('/:id', canWrite, canRoster, shiftAssignmentController.update.bind(shiftAssignmentController));
router.delete('/:id', canWrite, canRoster, shiftAssignmentController.remove.bind(shiftAssignmentController));

export default router;
