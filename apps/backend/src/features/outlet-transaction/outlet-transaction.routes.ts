import { Router } from 'express';
import { outletTransactionController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

/**
 * Admin-only, deliberately narrow.
 *
 * This router had no guard at all: any signed-in account, PR included, could
 * list and CREATE outlet transactions — money records. Nothing in the web or
 * mobile client calls it (there is no services/outlet-transaction at all), so
 * admin is the tightest gate that cannot break a screen. Widen it the day an
 * outlet screen genuinely needs it, with scoping, rather than leaving it open
 * in the meantime.
 */
router.use(requireAdmin);

router.get('/summary', outletTransactionController.summary.bind(outletTransactionController));
router.get('/', outletTransactionController.list.bind(outletTransactionController));
router.get('/:id', outletTransactionController.getById.bind(outletTransactionController));
router.post('/', outletTransactionController.create.bind(outletTransactionController));

export default router;
