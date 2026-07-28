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
// GET is deliberately left as-is: both portals read ratings, and narrowing it
// risks breaking reads that are not the hole here. Worth a second pass.
const router = Router();

router.get('/', ratingController.list.bind(ratingController));
router.post(
  '/',
  requireRole('admin', 'outlet'),
  outletOwnerOrOps,
  ratingController.upsert.bind(ratingController),
);

export default router;
