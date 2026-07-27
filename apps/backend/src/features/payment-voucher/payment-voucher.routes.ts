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

// A PR raises / withdraws a dispute on its OWN issued voucher (§3 F). 3- and
// 4-segment paths, so they never collide with the 2-segment '/mine/lines'.
router.post('/mine/:voucherId/dispute', paymentVoucherController.raiseMyDispute.bind(paymentVoucherController));
router.post('/mine/:voucherId/dispute/withdraw', paymentVoucherController.withdrawMyDispute.bind(paymentVoucherController));

// Payment vouchers are an agency (or admin) function; scoping to the caller's
// own agency is enforced in the controller.
router.use(requireRole('admin', 'agency'));

router.get('/', paymentVoucherController.list.bind(paymentVoucherController));
router.get('/:id', paymentVoucherController.getById.bind(paymentVoucherController));
router.post('/', paymentVoucherController.create.bind(paymentVoucherController));
router.put('/:id', paymentVoucherController.update.bind(paymentVoucherController));
router.delete('/:id', paymentVoucherController.remove.bind(paymentVoucherController));

export default router;
