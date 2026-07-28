import { Router } from 'express';
import { ratingController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { outletOwnerOrOps } from '@/middlewares/require-sub-role.js';

// Outlet→PR ratings. POST upserts the current rating for an (outlet, PR) pair.
//
// Writing carried no role gate beyond app auth, which let ANY signed-in account
// upsert a rating — including the PR being rated, on their own row. Rating is an
// outlet grant (the PR's is read-only), and submitting is outletCan('ratePrs'),
// which Outlet Finance does not hold.
//
// Reading is admin + agency + outlet. A PR is excluded: nothing in either client
// calls this (`fetchRatings` in the web services layer has no importers, and the
// mobile app never references ratings), and a PR token reaching an unscoped list
// would expose every outlet's private notes on every PR. All three outlet
// sub-roles keep read access — /outlet/ratings is gated on
// outletCan('viewLiveDashboard'), which Finance holds too — so no sub-role guard
// belongs on GET.
//
// The role alone is not enough, though: the controller now pins each caller to
// its own org (outlet → its venues, agency → its PRs), because a shared role on
// an unscoped list is still a cross-tenant read.
const router = Router();

router.get('/', requireRole('admin', 'agency', 'outlet'), ratingController.list.bind(ratingController));
router.post(
  '/',
  requireRole('admin', 'outlet'),
  outletOwnerOrOps,
  ratingController.upsert.bind(ratingController),
);

export default router;
