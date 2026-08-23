import { Router } from 'express';
import { prAvailabilityController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

// The PR's own calendar. Scoped server-side to `req.user.id`, so these sit
// OUTSIDE the role guard — same arrangement as shift-assignment's and
// outlet-swap's '/mine' routes — and must precede any '/:param' route so
// 'mine' is never read as a parameter.
router.get('/mine', prAvailabilityController.listMine.bind(prAvailabilityController));
router.post('/mine', prAvailabilityController.blockMine.bind(prAvailabilityController));
router.delete('/mine/:date', prAvailabilityController.unblockMine.bind(prAvailabilityController));

// The roster-wide read. Agency and admin only, and scoped through `agency_pr`
// in the repository on top of this gate: an outlet is deliberately not a reader
// — a PR's private calendar is their agency's staffing concern, and the venue
// only ever sees the roster it settles into.
router.get(
  '/',
  requireRole('admin', 'agency'),
  prAvailabilityController.listForAgency.bind(prAvailabilityController),
);

// WHEN the roster is committed elsewhere — times only, no agency and no venue.
//
// ⚠️ Carries the SAME gate as `/` above, deliberately. It is a narrower read —
// three columns, no reason, no names — but it still describes a PR's movements,
// so an outlet is no more a reader here than there.
router.get(
  '/committed',
  requireRole('admin', 'agency'),
  prAvailabilityController.listCommittedForAgency.bind(prAvailabilityController),
);

// The OUTLET's half of the busy rule (0131 companion): bare windows for the
// pool it may post jobs to — times only, no agency, no venue. A narrower
// read than '/committed' with its own scope, which is why it is a separate
// route rather than a widened gate on the agency one.
router.get(
  '/committed-outlet',
  requireRole('admin', 'outlet'),
  prAvailabilityController.listCommittedForOutlet.bind(prAvailabilityController),
);

export default router;
