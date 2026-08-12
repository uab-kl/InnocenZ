import { Router } from 'express';
import { outletWorkspaceController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { outletOwnerOrOpsIfMember } from '@/middlewares/require-sub-role.js';

// Outlet operational workspace (pay/commission rates, drink menu).
//
// Attendance & penalty rules are NOT here any more — 0113 moved them to
// `GET|PUT /agency/:id/penalty-rules`, because the fine they produce is a
// deduction on the agency→PR voucher, which the outlet neither pays nor sees.
//
// This router previously carried NO role gate at all, only app auth — which made
// every rate and drink price writable by any signed-in account,
// including a PR whose own wages are calculated from them. The controller reads
// :outletId from the path and never consults req.user, so the router is the only
// place this can be stopped.
//
// Agencies keep BOTH read and write. They need the rate card for commission
// rules and the outlet detail view, and they demonstrably configure rates on an
// outlet's behalf — audit_logs shows an agency owner doing exactly that 22 times
// on 2026-07-26, which fits outlet.onboarded_by_agency_id: agencies onboard
// outlets. Restricting writes to outlet-only broke that flow; it is restored
// here. Outlet Finance stays read-only per outletCan('manageWorkspace'), so the
// sub-role check refines outlet members without excluding agency callers.
const router = Router();

router.get(
  '/:outletId',
  requireRole('admin', 'agency', 'outlet'),
  outletWorkspaceController.getByOutletId.bind(outletWorkspaceController),
);
router.put(
  '/:outletId',
  requireRole('admin', 'agency', 'outlet'),
  outletOwnerOrOpsIfMember,
  outletWorkspaceController.upsert.bind(outletWorkspaceController),
);

export default router;
