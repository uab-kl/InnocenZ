import { Router } from 'express';
import { ratingController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { requirePermission } from '@/middlewares/require-permission.js';

// Outlet→PR ratings. POST upserts the current rating for an (outlet, PR) pair.
//
// Writing carried no role gate beyond app auth, which let ANY signed-in account
// upsert a rating — including the PR being rated, on their own row. Rating is an
// outlet grant (the PR's is read-only).
//
// ⚠️ WRITING IS `rating:create` — the web's `ratePrs` — and nothing else
// (29 Sep 2026). This asked `booking:create` (the `outletOwnerOrOps` alias,
// Post Job's permission), so the `rating` module's own grants in
// `role_permission` decided nothing: revoking a lane's rating:create would have
// hidden the button while the server still took the write, and granting it
// alone would have shown a button that 403s. Measured read-only before the
// switch: both permissions are held by exactly outlet Owner, Guarantor, Finance
// and Ops Head (Director by neither), so nobody's access changed with it.
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
  requirePermission('rating', 'create'),
  ratingController.upsert.bind(ratingController),
);

export default router;
