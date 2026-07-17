import { Router } from 'express';
import { paymentVoucherController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// Payment vouchers are an agency (or admin) function; scoping to the caller's
// own agency is enforced in the controller.
router.use(requireRole('admin', 'agency'));

router.get('/', paymentVoucherController.list.bind(paymentVoucherController));
router.get('/:id', paymentVoucherController.getById.bind(paymentVoucherController));
router.post('/', paymentVoucherController.create.bind(paymentVoucherController));
router.put('/:id', paymentVoucherController.update.bind(paymentVoucherController));
router.delete('/:id', paymentVoucherController.remove.bind(paymentVoucherController));

export default router;
