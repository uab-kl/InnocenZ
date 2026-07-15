import { Router } from 'express';
import { subscriptionController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', subscriptionController.getSubscriptions.bind(subscriptionController));
router.get('/:id', subscriptionController.getSubscriptionById.bind(subscriptionController));
router.post('', requireAdmin, subscriptionController.createSubscription.bind(subscriptionController));
router.put('/:id', requireAdmin, subscriptionController.updateSubscription.bind(subscriptionController));
router.delete('/:id', requireAdmin, subscriptionController.inactiveSubscription.bind(subscriptionController));

export default router;
