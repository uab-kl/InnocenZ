import { Router } from 'express';
import { paymentVoucherController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { agencyOwnerOrFinance } from '@/middlewares/require-sub-role.js';

const router = Router();

// A signed-in PR reads/mutates ONLY its own current-week draft voucher, scoped
// server-side by pr.id — so these sit outside the agency/admin guard below and
// must precede it (and the '/:id' route).
router.get(
  '/mine/current-week',
  paymentVoucherController.getMyCurrentWeek.bind(paymentVoucherController),
);
router.get(
  '/mine/last-week',
  paymentVoucherController.getMyLastWeek.bind(paymentVoucherController),
);
router.get(
  '/mine/history',
  paymentVoucherController.getMyHistory.bind(paymentVoucherController),
);
router.post(
  '/mine/lines',
  paymentVoucherController.addMyLine.bind(paymentVoucherController),
);
router.post(
  '/mine/receipts',
  paymentVoucherController.addMyReceipt.bind(paymentVoucherController),
);
router.patch(
  '/mine/lines/:lineId',
  paymentVoucherController.updateMyLine.bind(paymentVoucherController),
);
router.delete(
  '/mine/lines/:lineId',
  paymentVoucherController.deleteMyLine.bind(paymentVoucherController),
);
// Whole-receipt removal, server-side and in one call. The phone used to loop
// `deleteLine` over the siblings it could see, which half-removes a paper on any
// mid-loop failure and can only ever see the lines the screen had loaded.
router.delete(
  '/mine/receipts/:receiptId',
  paymentVoucherController.deleteMyReceipt.bind(paymentVoucherController),
);

// A PR signs its OWN issued voucher — the acceptance the agency waits on.
// 3-segment, so no collision with the 2-segment '/mine/lines' above.
router.post(
  '/mine/:voucherId/sign',
  paymentVoucherController.signMyVoucher.bind(paymentVoucherController),
);

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
  paymentVoucherController.createMyVoucherExportTicket.bind(
    paymentVoucherController,
  ),
);

// A PR raises / withdraws a dispute on its OWN issued voucher (§3 F). 3- and
// 4-segment paths, so they never collide with the 2-segment '/mine/lines'.
router.post(
  '/mine/:voucherId/dispute',
  paymentVoucherController.raiseMyDispute.bind(paymentVoucherController),
);
router.post(
  '/mine/:voucherId/dispute/withdraw',
  paymentVoucherController.withdrawMyDispute.bind(paymentVoucherController),
);

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
//
// WRITES carry a sub-role gate: approving a day is a money attestation, and the
// owner's call (30 Jul 2026) was owner + finance — the same set that holds
// agencyCan 'raisePv' in the portal. The READ is deliberately NOT gated: seeing
// what was decided is not the same authority as deciding it.
router.patch(
  '/:id/day-review/:date',
  agencyOwnerOrFinance,
  paymentVoucherController.reviewDay.bind(paymentVoucherController),
);
router.post(
  '/:id/day-review/approve-all',
  agencyOwnerOrFinance,
  paymentVoucherController.approveAllDays.bind(paymentVoucherController),
);

// The agency's receipt-review feed (full OCR evidence per receipt). One
// segment, so it MUST precede '/:id' below.
router.get(
  '/receipts',
  paymentVoucherController.listAgencyReceipts.bind(paymentVoucherController),
);

// The receipt lifecycle: PENDING -> APPROVED (here) -> VERIFIED (the Monday
// rollover, or a resolved dispute — never a request).
//
// Both writes carry the same sub-role gate as the day review: approving a
// receipt, and correcting the figure on it, are money attestations. The READ
// above stays ungated for the same reason it does there — seeing what was
// decided is not the authority to decide it.
//
// '/receipts/...' is registered before '/:id' so the word "receipts" is never
// read as a voucher id.
router.patch(
  '/receipts/:receiptId/review',
  agencyOwnerOrFinance,
  paymentVoucherController.reviewReceipt.bind(paymentVoucherController),
);
router.patch(
  '/receipts/:receiptId/lines/:lineId',
  agencyOwnerOrFinance,
  paymentVoucherController.editReceiptLine.bind(paymentVoucherController),
);

// The other two halves of "edit", same gate and same reasoning as the line
// correction above: ADDING a drink or tip line the paper carries and the log
// missed, and correcting the RECEIPT's own facts (order number, date). Both are
// money attestations — the date write moves the lines with it — so both carry
// `agencyOwnerOrFinance`, and both are targeted by id rather than routed through
// PUT '/:id', which rewrites a voucher's whole line set.
router.post(
  '/receipts/:receiptId/lines',
  agencyOwnerOrFinance,
  paymentVoucherController.addReceiptLine.bind(paymentVoucherController),
);

// The OUTLET'S OWN price list for the receipt above — what the add form must
// choose from, and what the add endpoint refuses anything outside of.
//
// Scoped through the RECEIPT rather than taking an outlet id, so an agency can
// only read the catalogue of an outlet one of its own vouchers was earned at;
// the controller 404s cross-tenant before it ever resolves the outlet.
//
// UNGATED at sub-role, exactly like the '/receipts' feed above and for the same
// reason the router already states: seeing what an outlet sells is not the
// authority to add a line with it — that write keeps `agencyOwnerOrFinance`.
router.get(
  '/receipts/:receiptId/catalogue',
  paymentVoucherController.getReceiptCatalogue.bind(paymentVoucherController),
);
router.patch(
  '/receipts/:receiptId',
  agencyOwnerOrFinance,
  paymentVoucherController.editReceipt.bind(paymentVoucherController),
);

// The agency's dispute queue and its decisions. '/disputes' MUST precede the
// '/:id' route below — both are one segment, so registered the other way round
// the queue would be read as a voucher whose id is the word "disputes".
//
// OWNER DECISION (31 Jul 2026) — may an admin resolve a dispute? YES, but as a
// deliberate ESCALATION path, not as routine review. The steer is that the
// agency handles payment vouchers, and it does: this is the only admin write
// left on the PV surface, kept because agency-only leaves a PR with no recourse
// when their agency goes quiet. Everything else an admin sees here is read-only.
//
// The gate below is the half that was a hole regardless of that decision.
// Resolving a dispute settles MONEY, yet it inherited only the mount-level
// requireRole('admin','agency') — so any agency member could resolve one, while
// merely approving a day required agencyOwnerOrFinance. Same asymmetry the
// create/update routes had. `guard()` lets admin bypass the sub-role check, so
// this narrows agency members WITHOUT closing the escalation path above.
router.get(
  '/disputes',
  paymentVoucherController.listDisputes.bind(paymentVoucherController),
);
router.post(
  '/disputes/:disputeId/resolve',
  agencyOwnerOrFinance,
  paymentVoucherController.resolveDispute.bind(paymentVoucherController),
);

router.get(
  '/:id',
  paymentVoucherController.getById.bind(paymentVoucherController),
);

// Raising and rewriting a voucher are money WRITES, and until now they were the
// LEAST-gated routes here: any agency member could reach them, while merely
// *reviewing* a day or a receipt required agencyOwnerOrFinance. The endpoints
// that author money were looser than the ones that check it.
//
// Same guard as the review routes, deliberately — `agencyOwnerOrFinance` mirrors
// the portal's own `agencyCan('raisePv')`, and the sub-role enum holds exactly
// owner and finance today. So this is a no-op for every legitimate caller and is
// written down so a third sub-role cannot silently inherit the right to author
// payroll. Callers checked before gating (the `GET /user` lesson — a flat gate
// can blank a live screen): `updatePaymentVoucher` has ONE consumer,
// `use-agency-pvs.ts`, reached only from PV screens already gated on `raisePv`;
// `createPaymentVoucher` has no frontend caller at all.
//
// READS stay open to the whole agency: seeing what a PR is owed is ordinary
// roster work, and narrowing that would blank live screens.
router.post(
  '/',
  agencyOwnerOrFinance,
  paymentVoucherController.create.bind(paymentVoucherController),
);
router.put(
  '/:id',
  agencyOwnerOrFinance,
  paymentVoucherController.update.bind(paymentVoucherController),
);
// The agency's half of the dual signature, taken BEFORE the voucher is sent —
// `update` now refuses the pending_review -> sent transition without it. Same
// guard as every other money write here: signing is an attestation, and the
// sub-role enum holds exactly owner and finance, which is who may make one.
router.post(
  '/:id/finance-sign',
  agencyOwnerOrFinance,
  paymentVoucherController.financeSignVoucher.bind(paymentVoucherController),
);
router.delete(
  '/:id',
  canDelete,
  paymentVoucherController.remove.bind(paymentVoucherController),
);

export default router;
