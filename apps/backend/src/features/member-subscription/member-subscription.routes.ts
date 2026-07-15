import { Router } from 'express';
import { memberSubscriptionController } from '@/composition-root.js';

const router = Router();

router.get('/summary', memberSubscriptionController.summary.bind(memberSubscriptionController));
router.get('/', memberSubscriptionController.list.bind(memberSubscriptionController));
router.get('/:id', memberSubscriptionController.getById.bind(memberSubscriptionController));
router.post('/', memberSubscriptionController.create.bind(memberSubscriptionController));
router.put('/:id', memberSubscriptionController.update.bind(memberSubscriptionController));
router.patch('/:id/cancel', memberSubscriptionController.cancel.bind(memberSubscriptionController));

export default router;
