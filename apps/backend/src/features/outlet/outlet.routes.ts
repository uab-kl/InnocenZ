import { Router } from 'express';
import { outletController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import { outletOwnerOnly } from '@/middlewares/require-sub-role.js';

const router = Router();

// Outlet CRUD
router.get('/', outletController.list.bind(outletController));
// Must precede `/:id` so "memberships" isn't captured as an outlet id.
router.get('/memberships', outletController.listMemberships.bind(outletController));
// Same reason: "geocode" must not be captured as an outlet id.
router.get('/geocode', outletController.geocode.bind(outletController));
router.get('/:id', outletController.getById.bind(outletController));
router.get('/:id/geocode', outletController.geocodeOwnAddress.bind(outletController));
router.post('/', outletController.create.bind(outletController));
// Editing the venue record is outletCan('editSettings') — owner only; Finance
// and Ops are both excluded. Neither of these carried ANY role gate before, so
// any signed-in account, a PR included, could rewrite an outlet or move the
// geo-fence centre the 50 m check-in rule is measured against.
const canEditOutlet = requireRole('admin', 'outlet');

router.put('/:id', canEditOutlet, outletOwnerOnly, outletController.update.bind(outletController));
router.patch(
  '/:id/geo-fence',
  canEditOutlet,
  outletOwnerOnly,
  outletController.setGeoFence.bind(outletController),
);
router.patch('/:id/approve', requireAdmin, outletController.approve.bind(outletController));
router.patch('/:id/suspend', requireAdmin, outletController.suspend.bind(outletController));

// Outlet members
router.get('/:id/members', outletController.listMembers.bind(outletController));
router.post('/:id/members', outletController.addMember.bind(outletController));
router.put('/:id/members/:memberId', outletController.updateMember.bind(outletController));
router.delete('/:id/members/:memberId', outletController.removeMember.bind(outletController));

export default router;
