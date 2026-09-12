import { Router } from 'express';
import { shiftTemplateController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { requireOutletPermissionIfMember } from '@/middlewares/require-sub-role.js';

// Event templates — the outlet's own gallery, so outlet (+ admin) only.
// Agencies never author a venue's events; they receive the posted shift.
// Writes take the same sub-role refinement as the Workspace: an outlet
// Finance member reads the gallery but does not reshape it.
const router = Router();

router.get(
  '/',
  requireRole('admin', 'outlet'),
  shiftTemplateController.list.bind(shiftTemplateController),
);
router.post(
  '/',
  requireRole('admin', 'outlet'),
  requireOutletPermissionIfMember('booking', 'create'),
  shiftTemplateController.create.bind(shiftTemplateController),
);
router.put(
  '/:id',
  requireRole('admin', 'outlet'),
  requireOutletPermissionIfMember('booking', 'create'),
  shiftTemplateController.update.bind(shiftTemplateController),
);
router.delete(
  '/:id',
  requireRole('admin', 'outlet'),
  requireOutletPermissionIfMember('booking', 'create'),
  shiftTemplateController.remove.bind(shiftTemplateController),
);

export default router;
