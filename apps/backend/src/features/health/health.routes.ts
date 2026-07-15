import { Router } from 'express';
import { healthController } from '@/composition-root.js';

const router = Router();

router.get('', healthController.healthCheck.bind(healthController));
router.get('/db', healthController.dbHealthCheck.bind(healthController));

export default router;
