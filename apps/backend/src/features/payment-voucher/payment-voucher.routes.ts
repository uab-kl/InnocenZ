import { Router } from 'express';
import { paymentVoucherController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// A signed-in PR reads/mutates ONLY its own current-week draft voucher, scoped
// server-side by pr.id — so these sit outside the agency/admin guard below and
// must precede it (and the '/:id' route).
router.get('/mine/current-week', paymentVoucherController.getMyCurrentWeek.bind(paymentVoucherController));
router.get('/mine/last-week', paymentVoucherController.getMyLastWeek.bind(paymentVoucherController));
router.get('/mine/history', paymentVoucherController.getMyHistory.bind(paymentVoucherController));
router.post('/mine/lines', paymentVoucherController.addMyLine.bind(paymentVoucherController));
router.post('/mine/receipts', paymentVoucherController.addMyReceipt.bind(paymentVoucherController));
router.patch('/mine/lines/:lineId', paymentVoucherController.updateMyLine.bind(paymentVoucherController));
router.delete('/mine/lines/:lineId', paymentVoucherController.deleteMyLine.bind(paymentVoucherController));

// A PR signs its OWN issued voucher — the acceptance the agency waits on.
// 3-segment, so no collision with the 2-segment '/mine/lines' above.
router.post('/mine/:voucherId/sign', paymentVoucherController.signMyVoucher.bind(paymentVoucherController));

// The PR downloads its OWN voucher as the printed Excel document (History →
// Excel button). Same 3-segment shape as '/sign' above.
router.get(
  '/mine/:voucherId/export.xlsx',
  paymentVoucherController.exportMyVoucherExcel.bind(paymentVoucherController),
);
router.get(
  '/mine/:voucherId/export.pdf',
  paymentVoucherController.exportMyVoucherPdf.bind(paymentVoucherController),
);

// The phone flow: an authenticated POST mints a 5-minute download ticket, and
// the system browser then opens /payment-voucher/export/<ticket>/... (mounted
// BEFORE authenticateJWT in router/v1.ts) — a browser download cannot carry
// the Bearer header, and the session token must never appear in a URL.
router.post(
  '/mine/:voucherId/export-ticket',
  paymentVoucherController.createMyVoucherExportTicket.bind(paymentVoucherController),
);

// A PR raises / withdraws a dispute on its OWN issued voucher (§3 F). 3- and
// 4-segment paths, so they never collide with the 2-segment '/mine/lines'.
router.post('/mine/:voucherId/dispute', paymentVoucherController.raiseMyDispute.bind(paymentVoucherController));
router.post('/mine/:voucherId/dispute/withdraw', paymentVoucherController.withdrawMyDispute.bind(paymentVoucherController));

// Payment vouchers are an agency (or admin) function; scoping to the caller's
// own agency is enforced in the controller.
router.use(requireRole('admin', 'agency'));

// The agency's grant is create-read-update, NOT delete. A voucher is a money
// record a PR may already have signed or disputed, so destroying one stays with
// admin; everything else on this router remains agency-reachable.
const canDelete = requireRole('admin');

router.get('/', paymentVoucherController.list.bind(paymentVoucherController));

// Day-by-day review, BEFORE the voucher goes to the PR. The READ rides on
// GET '/:id' alongside the receipts rather than living on its own path, so the
// panel cannot show decisions that disagree with the lines they refer to.
router.patch(
  '/:id/day-review/:date',
  paymentVoucherController.reviewDay.bind(paymentVoucherController),
);
router.post(
  '/:id/day-review/approve-all',
  paymentVoucherController.approveAllDays.bind(paymentVoucherController),
);

// The agency's receipt-review feed (full OCR evidence per receipt). One
// segment, so it MUST precede '/:id' below.
router.get('/receipts', paymentVoucherController.listAgencyReceipts.bind(paymentVoucherController));

// The agency's dispute queue and its decisions. '/disputes' MUST precede the
// '/:id' route below — both are one segment, so registered the other way round
// the queue would be read as a voucher whose id is the word "disputes".
router.get('/disputes', paymentVoucherController.listDisputes.bind(paymentVoucherController));
router.post(
  '/disputes/:disputeId/resolve',
  paymentVoucherController.resolveDispute.bind(paymentVoucherController),
);

router.get('/:id', paymentVoucherController.getById.bind(paymentVoucherController));
router.post('/', paymentVoucherController.create.bind(paymentVoucherController));
router.put('/:id', paymentVoucherController.update.bind(paymentVoucherController));
router.delete('/:id', canDelete, paymentVoucherController.remove.bind(paymentVoucherController));

export default router;
