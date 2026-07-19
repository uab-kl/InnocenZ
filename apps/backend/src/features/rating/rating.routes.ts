import { Router } from 'express';
import { ratingController } from '@/composition-root.js';

// Outlet→PR ratings. No role gate beyond app auth — an outlet reads + submits
// its own ratings. POST upserts the current rating for an (outlet, PR) pair.
const router = Router();

router.get('/', ratingController.list.bind(ratingController));
router.post('/', ratingController.upsert.bind(ratingController));

export default router;
