import { Router } from 'express';
import { subscriptionFeatureController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('', subscriptionFeatureController.getSubscriptionFeatures.bind(subscriptionFeatureController));
router.get('/:id', subscriptionFeatureController.getSubscriptionFeatureById.bind(subscriptionFeatureController));
router.post('', requireAdmin, subscriptionFeatureController.createSubscriptionFeature.bind(subscriptionFeatureController));
router.put('/:id', requireAdmin, subscriptionFeatureController.updateSubscriptionFeature.bind(subscriptionFeatureController));
router.delete('/:id', requireAdmin, subscriptionFeatureController.deleteSubscriptionFeature.bind(subscriptionFeatureController));

export default router;
