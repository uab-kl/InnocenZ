import { Router } from 'express';
import { outletWorkspaceController } from '@/composition-root.js';

// Outlet operational workspace (pay/commission rates, drink menu, penalty rules).
// No role gate beyond app auth — an outlet reads + saves its own workspace.
const router = Router();

router.get(
  '/:outletId',
  outletWorkspaceController.getByOutletId.bind(outletWorkspaceController),
);
router.put(
  '/:outletId',
  outletWorkspaceController.upsert.bind(outletWorkspaceController),
);

export default router;
