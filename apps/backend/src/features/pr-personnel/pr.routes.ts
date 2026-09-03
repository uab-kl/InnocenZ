import { Router } from 'express';
import { prController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';
import { redactIdentityDocsForOutlet } from '@/middlewares/redact-identity-docs.js';

const router = Router();

// PR personnel management is an agency (or admin) function. Outlets may READ the
// PRs bookable at their own venues — the controller pins them to that set, so
// the wider role here never widens WHICH PEOPLE they can see.
//
// ⚠️ It never narrowed WHICH FIELDS, and that was the whole gap: the row set was
// correctly scoped while `icNo` and `profile.dob` rode out on every row of it.
// `redactIdentityDocsForOutlet` is the same middleware `/user` has always used,
// and the controller honours the flag it sets. A GATE is the wrong instrument
// here for exactly the reason it was there — an outlet legitimately reads this
// list to build its booking picker.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency');

// PR-scoped self-service. Must sit above the role guards (a PR is none of the
// roles below) and above `/:id`, which would otherwise swallow "mine".
router.put('/mine/agencies', prController.updateMyAgencies.bind(prController));
// Departure request — refused (409, reasons in words) until everything with
// that agency is settled: vouchers paid, disputes closed, no upcoming or
// unfinished shifts. Leaving NEVER goes through the replace-set save above.
router.post('/mine/agencies/:agencyId/leave', prController.requestAgencyLeave.bind(prController));
// The rules the caller is CHARGED by — the cancellation bands price the PR
// app's Cancel button. No `:id`: the agency comes from the caller's own
// membership, which is what makes it safe to serve without a scope guard.
router.get('/mine/penalty-rules', prController.getMyPenaltyRules.bind(prController));
// "Was I penalised this week?" — the caller's own SEALED charges. Distinct from
// `/:id/penalties` below, which proposes to an agency what a week WOULD cost.
router.get('/mine/penalties', prController.getMyPenalties.bind(prController));

router.get('/', canRead, redactIdentityDocsForOutlet, prController.list.bind(prController));

// Proposed penalty deductions for a PR's week at one outlet. Read-only — it
// computes what COULD be charged and never touches a voucher; applying it is a
// deliberate agency act via PUT /payment-voucher/:id. Two segments, so it must
// precede '/:id' or that route swallows it.
router.get('/:id/penalties', canWrite, prController.getPenalties.bind(prController));

router.get('/:id', canRead, redactIdentityDocsForOutlet, prController.getById.bind(prController));
router.post('/', canWrite, requirePermission('workforce', 'update'), prController.create.bind(prController));
router.put('/:id', canWrite, requirePermission('workforce', 'update'), prController.update.bind(prController));
router.delete('/:id', canWrite, requirePermission('workforce', 'update'), prController.remove.bind(prController));

export default router;
