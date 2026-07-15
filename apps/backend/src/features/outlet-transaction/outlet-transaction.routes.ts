import { Router } from 'express';
import { outletTransactionController } from '@/composition-root.js';

const router = Router();

router.get('/summary', outletTransactionController.summary.bind(outletTransactionController));
router.get('/', outletTransactionController.list.bind(outletTransactionController));
router.get('/:id', outletTransactionController.getById.bind(outletTransactionController));
router.post('/', outletTransactionController.create.bind(outletTransactionController));

export default router;
