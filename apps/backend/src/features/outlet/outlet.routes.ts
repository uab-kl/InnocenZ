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

// Outlet members. Same reasoning as the agency member routes: an outlet_user row
// is what requireOutletSubRole and resolveOrgScope() read to decide who a caller
// is, addMember trusts userId + subRole from the body, and none of it was gated —
// so one POST made any signed-in account an active owner of any venue. Writes are
// admin-only (no client calls them; every existing row came from a seed script);
// reads stay open to the three org roles for the profile screens.
const canReadMembers = requireRole('admin', 'agency', 'outlet');

router.get('/:id/members', canReadMembers, outletController.listMembers.bind(outletController));
router.post('/:id/members', requireAdmin, outletController.addMember.bind(outletController));
router.put('/:id/members/:memberId', requireAdmin, outletController.updateMember.bind(outletController));
router.delete('/:id/members/:memberId', requireAdmin, outletController.removeMember.bind(outletController));

export default router;
