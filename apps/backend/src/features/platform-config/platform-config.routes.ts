import { Router } from 'express';
import { platformConfigController } from '@/composition-root.js';

const router = Router();

router.get('/', platformConfigController.getConfig.bind(platformConfigController));
router.put('/', platformConfigController.updateConfig.bind(platformConfigController));

export default router;
