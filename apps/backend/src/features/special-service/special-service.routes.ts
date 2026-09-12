import { Router } from 'express';
import { specialServiceController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

/*
 * ⚠️ PLATFORM-WIDE COUNTS ARE AN ADMIN FACT — this was the ONE route on this
 * router with no guard of any kind.
 *
 * `statusSummary` takes `(_req, res)` and ignores the caller entirely, so
 * `statusCounts()` runs an unfiltered `group by status` over every
 * `special_service` row on the platform. The router sits below
 * `authenticateJWT` with no guard at its mount, so any signed-in token reached
 * it — including a PR's, who is on this router legitimately for
 * `/special-service/mine`. A venue could read how much business every other
 * venue is putting through, and a PR could read all of it.
 *
 * `requireAdmin`, matching `/admin/pending` and all five PATCH routes below: a
 * caller who wants THEIR OWN counts already has `GET /special-service`, which
 * `scopedFilter` narrows to their organisation.
 */
router.get(
  '/summary',
  requireAdmin,
  specialServiceController.statusSummary.bind(specialServiceController),
);
router.get(
  '/admin/pending',
  requireAdmin,
  specialServiceController.listAdminPending.bind(specialServiceController),
);
router.get('/', specialServiceController.list.bind(specialServiceController));
router.get('/mine', specialServiceController.listMine.bind(specialServiceController));
router.get('/:id', specialServiceController.getById.bind(specialServiceController));
// Creating stays open to every signed-in role — outlets, agencies and PRs all
// post special services — but the controller now pins `initiatedBy` to what the
// caller actually is, since that field decides whether a posting needs admin
// review.
router.post('/', specialServiceController.create.bind(specialServiceController));
// Assigning a vendor and moving an order's status are admin acts, matching the
// admin-only PATCH routes below. Both carried no gate and neither controller
// method checks ownership — they update by id alone, so any signed-in account
// could vendor-assign or complete/cancel any order in the platform. No client
// calls assign at all, and the only caller of status is the admin screen
// (routes/admin/service/other.tsx); audit_logs agrees — all 10 status updates on
// record were made by an admin.
router.patch('/:id/assign', requireAdmin, specialServiceController.assign.bind(specialServiceController));
router.patch('/:id/status', requireAdmin, specialServiceController.updateStatus.bind(specialServiceController));
router.patch('/:id', requireAdmin, specialServiceController.update.bind(specialServiceController));
router.patch(
  '/:id/admin-approve',
  requireAdmin,
  specialServiceController.adminApprove.bind(specialServiceController),
);
router.patch(
  '/:id/admin-decline',
  requireAdmin,
  specialServiceController.adminDecline.bind(specialServiceController),
);

export default router;
