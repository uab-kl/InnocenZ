import { Router } from 'express';
import { outletWorkspaceController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { outletOwnerOrOps } from '@/middlewares/require-sub-role.js';

// Outlet operational workspace (pay/commission rates, drink menu, penalty rules).
//
// This router previously carried NO role gate at all, only app auth — which made
// every rate, drink price and penalty rule writable by any signed-in account,
// including a PR whose own wages are calculated from them. Reads stay open to
// the agency too: it needs the rate card for its commission rules and outlet
// detail view. Writes are the outlet's own, and Outlet Finance is read-only here
// per outletCan('manageWorkspace').
const router = Router();

router.get(
  '/:outletId',
  requireRole('admin', 'agency', 'outlet'),
  outletWorkspaceController.getByOutletId.bind(outletWorkspaceController),
);
router.put(
  '/:outletId',
  requireRole('admin', 'outlet'),
  outletOwnerOrOps,
  outletWorkspaceController.upsert.bind(outletWorkspaceController),
);

export default router;
