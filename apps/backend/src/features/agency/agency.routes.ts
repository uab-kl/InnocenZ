import { Router } from 'express';
import { agencyController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import { agencyOwnerOfParam } from '@/middlewares/require-sub-role.js';

const router = Router();

router.get('/', agencyController.list.bind(agencyController));
router.get('/memberships', agencyController.listMemberships.bind(agencyController));
// Before '/:id' so the literal path is not captured as an agency id.
router.get('/pr-links', agencyController.listPrLinks.bind(agencyController));
router.get('/:id', agencyController.getById.bind(agencyController));
router.post('/', agencyController.create.bind(agencyController));
// Editing the agency record is agencyCan('editSettings') — owner only. This
// carried no role gate at all before, so any signed-in account could rewrite an
// agency's own details.
//
// The owner check is SCOPED to `:id`. The unscoped `agencyOwnerOnly` asked only
// "are you an owner?", which every agency owner satisfied for every agency — so
// one agency's owner could rewrite another's name, SSM number and contacts, and
// set `status` to skip admin approval. Found when wiring the Settings screen's
// save to this endpoint: the gate was fine while nothing called it.
router.put(
  '/:id',
  requireRole('admin', 'agency'),
  agencyOwnerOfParam,
  agencyController.update.bind(agencyController),
);
router.patch('/:id/approve', requireAdmin, agencyController.approve.bind(agencyController));
router.patch('/:id/suspend', requireAdmin, agencyController.suspend.bind(agencyController));

router.get('/:id/prs', agencyController.listAgencyPrs.bind(agencyController));

// Membership IS identity. An agency_user row is what requireAgencySubRole and
// resolveOrgScope() both read to decide who a caller is, so whoever can write
// this table can grant themselves any sub-role in any agency. These four routes
// carried no gate, and addMember takes userId + subRole straight from the body
// with no ownership check — one POST made any signed-in account, a PR included,
// an active owner of any agency, which then satisfies every sub-role guard and
// hands over that agency's shifts, vouchers, sales and ratings.
//
// Writes are admin-only: no client calls them (zero callers across web and
// mobile) and every membership row in the database was written by a seed script,
// never through the API. Reads stay open to the three org roles because the
// agency and outlet profile screens list their own members; a PR has no reason
// to enumerate an organisation's staff.
const canReadMembers = requireRole('admin', 'agency', 'outlet');

router.get('/:id/members', canReadMembers, agencyController.listMembers.bind(agencyController));
router.post('/:id/members', requireAdmin, agencyController.addMember.bind(agencyController));
router.put('/:id/members/:memberId', requireAdmin, agencyController.updateMember.bind(agencyController));
router.delete('/:id/members/:memberId', requireAdmin, agencyController.removeMember.bind(agencyController));

export default router;
