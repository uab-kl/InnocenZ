import { Router } from 'express';
import { cutlostController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';
import { requireOutletSubRole } from '@/middlewares/require-sub-role.js';

const router = Router();

/**
 * Cut-loss. Both sides of the conversation live here, and the ROLE GATE is not
 * the scope check — every handler re-derives the caller's agency/outlet and
 * matches it against the shift. A role gate says "an outlet may raise requests";
 * only the handler can say "at ITS OWN venue".
 *
 * PRs are absent from every gate below on purpose: a PR is the subject of a
 * release, never a party to it. They learn of it through the
 * `shift_released_early` notification and their own sealed assignment.
 */
router.get(
  '/',
  requireRole('admin', 'agency', 'outlet'),
  cutlostController.list.bind(cutlostController),
);
router.post(
  '/',
  requireRole('admin', 'outlet'),
  // A lane guard rather than requirePermission('booking','create'): outlet
  // Finance holds no booking grant at all and would have been locked out of a
  // request it may legitimately raise. Director resolves to its own lane and is
  // refused; Guarantor folds into owner.
  requireOutletSubRole('owner', 'finance', 'operations_head'),
  cutlostController.create.bind(cutlostController),
);
// Deciding is the agency's alone — the venue that asked must not approve its own
// ask, so `outlet` is deliberately missing from this one.
router.post(
  '/:id/decision',
  requireRole('admin', 'agency'),
  // Deciding a cut-loss is an approval, not mere agency membership.
  requirePermission('approvals', 'update'),
  cutlostController.decide.bind(cutlostController),
);

export default router;
