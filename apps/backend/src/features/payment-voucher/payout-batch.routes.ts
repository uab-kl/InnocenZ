import { Router } from 'express';
import { payoutBatchController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { agencyOwnerOrFinance } from '@/middlewares/require-sub-role.js';

const router = Router();

// A payout run is an agency (or admin) function end to end. There is no
// PR-facing path here on purpose: a PR learns they were paid from their own
// voucher and the `payment_voucher_paid` notification, never from the agency's
// bank run — which carries other payees' account numbers.
router.use(requireRole('admin', 'agency'));

/**
 * ⚠️ EVERY ROUTE BELOW CARRIES `agencyOwnerOrFinance`, INCLUDING THE READS.
 *
 * That breaks the pattern next door in `payment-voucher.routes.ts`, where reads
 * are deliberately open to the whole agency role and only money attestations
 * are gated ("seeing what was decided is not the same authority as deciding
 * it"). The difference is what a read RETURNS here: candidates and batch items
 * carry the payee's bank account number and IC. That is PII, not a decision,
 * and this project has already leaked IC/phone/DOB through an ungated agency
 * read. Least privilege — if you cannot pay, you do not need to see where
 * someone banks.
 */
router.use(agencyOwnerOrFinance);

// Single-segment paths first, so 'candidates' is never read as a batch id.
router.get(
  '/candidates',
  payoutBatchController.listCandidates.bind(payoutBatchController),
);

router.get('/', payoutBatchController.list.bind(payoutBatchController));
router.post('/', payoutBatchController.create.bind(payoutBatchController));

router.get('/:id', payoutBatchController.detail.bind(payoutBatchController));

// The bank file. A GET that mutates (draft -> exported, items -> sent) because
// the download IS the handover — there is no separate moment when the agency
// "takes" the file, and a batch that stayed `draft` after being downloaded
// would let the same week be exported twice as if it had never gone out.
router.get(
  '/:id/export.csv',
  payoutBatchController.exportCsv.bind(payoutBatchController),
);

// Abandon a draft. Refused once exported — see the handler.
router.post('/:id/cancel', payoutBatchController.cancel.bind(payoutBatchController));

router.post(
  '/:id/submitted',
  payoutBatchController.markSubmitted.bind(payoutBatchController),
);

// What the bank reported, line by line. The only path that marks vouchers paid
// in bulk, and it re-states the signed-only rule down in the repository.
router.post('/:id/settle', payoutBatchController.settle.bind(payoutBatchController));

// Settle a whole run from the bank's own response file. Refuses on any line it
// cannot match, so a partial file never half-settles a run.
router.post(
  '/:id/import-response',
  payoutBatchController.importResponse.bind(payoutBatchController),
);

// The API-key path. 501s with instructions until PAYOUT_PROVIDER is set.
router.post(
  '/:id/submit-provider',
  payoutBatchController.submitToProvider.bind(payoutBatchController),
);

export default router;
