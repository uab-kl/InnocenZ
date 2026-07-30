import { Router } from 'express';
import { paymentVoucherController } from '@/composition-root.js';

/**
 * Ticket downloads for the phone's system browser. Mounted in router/v1.ts
 * BEFORE authenticateJWT on purpose: a browser download cannot attach the
 * Bearer header. Authorization already happened when the signed-in PR minted
 * the ticket (POST /payment-voucher/mine/:voucherId/export-ticket) — the
 * 128-bit, 5-minute, single-voucher ticket in the path is the credential.
 */
const router = Router();

router.get(
  '/:ticket/voucher.xlsx',
  paymentVoucherController.exportTicketExcel.bind(paymentVoucherController),
);
router.get(
  '/:ticket/print',
  paymentVoucherController.exportTicketPrint.bind(paymentVoucherController),
);

export default router;
