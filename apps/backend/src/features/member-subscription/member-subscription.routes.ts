import { Router } from 'express';
import { memberSubscriptionController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';

const router = Router();

/**
 * This router had no guard at all: any signed-in account — a PR included —
 * could page every member's billing history and cancel a subscription.
 *
 * Reads are open to the three roles that legitimately have one (the agency and
 * outlet Subscription screens, and the admin business history) and are SCOPED
 * in the controller, so an agency sees only its own row. The gate alone would
 * not have been enough: without scoping, one agency could read another's.
 */
const canRead = requireRole('admin', 'agency', 'outlet');

router.get('/summary', canRead, memberSubscriptionController.summary.bind(memberSubscriptionController));
router.get('/', canRead, memberSubscriptionController.list.bind(memberSubscriptionController));
router.get('/:id', canRead, memberSubscriptionController.getById.bind(memberSubscriptionController));

// Writing a billing record is an admin act. No client calls these today: the
// agency and outlet screens are read-only, and a plan change goes through
// admin_request.
router.post('/', requireAdmin, memberSubscriptionController.create.bind(memberSubscriptionController));
router.put('/:id', requireAdmin, memberSubscriptionController.update.bind(memberSubscriptionController));
router.patch('/:id/cancel', requireAdmin, memberSubscriptionController.cancel.bind(memberSubscriptionController));

export default router;
