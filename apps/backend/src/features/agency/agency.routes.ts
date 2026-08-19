import { Router } from 'express';
import { agencyController, agencyPenaltyRuleController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import {
  agencyOwnerOfParam,
  refuseOrgStatusChange,
  requireAgencySubRoleScoped,
} from '@/middlewares/require-sub-role.js';

const router = Router();

// Directory listing is admin + agency only — outlet must not enumerate agencies
// (admin dashboard pending_review used to succeed for any signed-in JWT).
router.get('/', requireRole('admin', 'agency'), agencyController.list.bind(agencyController));
router.get(
  '/memberships',
  requireRole('admin', 'agency'),
  agencyController.listMemberships.bind(agencyController),
);
// Before '/:id' so the literal path is not captured as an agency id.
// PRs may read their own links (controller clamps userIds to self).
router.get(
  '/pr-links',
  requireRole('admin', 'agency', 'pr'),
  agencyController.listPrLinks.bind(agencyController),
);
router.get('/:id', requireRole('admin', 'agency', 'outlet'), agencyController.getById.bind(agencyController));
router.post('/', requireRole('admin', 'agency'), agencyController.create.bind(agencyController));
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
  // Only HERE, not on the member routes: `agency.status` is the admin lane,
  // while `agency_user.status` is an owner's to set.
  refuseOrgStatusChange(),
  agencyController.update.bind(agencyController),
);
router.patch('/:id/approve', requireAdmin, agencyController.approve.bind(agencyController));
router.patch('/:id/suspend', requireAdmin, agencyController.suspend.bind(agencyController));

// This carried NO gate at all while every route around it had one, so any
// signed-in token — a PR's, an outlet's, another agency's — could read any
// agency's full roster by id: names, `id_no`, `dob`, email and phone. Scoped to
// the agency in `:id` for the same reason `PUT /:id` is: a bare role check
// passes every agency owner for EVERY agency, which is not a scope check.
//
// `finance` is allowed alongside `owner` because payroll works from this
// roster; the approval WRITE below stays owner-only. Admin bypasses the scope
// guard (require-sub-role.ts), which is what keeps the admin PR-tab working.
//
// Read-scoping this route is what makes it safe to return the IC document keys
// it now selects — those must never sit behind an open endpoint.
router.get(
  '/:id/prs',
  requireRole('admin', 'agency'),
  requireAgencySubRoleScoped('id', 'owner', 'finance'),
  agencyController.listAgencyPrs.bind(agencyController),
);
// Attendance & discipline policy (0113 moved it off the outlet workspace).
//
// Two segments, so both must precede nothing that would swallow them — `/:id`
// is a single segment and cannot, but keep them beside `/:id/prs` for the same
// reason that route is scoped: a bare `requireRole('agency')` passes EVERY
// agency owner for EVERY agency, so without the scoped guard one agency could
// read and rewrite another's fine schedule.
//
// Read allows `finance` alongside `owner` because payroll evaluates breaches
// when building a voucher. The WRITE stays owner-only: a fine schedule takes
// pay away from workers, which is the owner's call, not the bookkeeper's.
router.get(
  '/:id/penalty-rules',
  requireRole('admin', 'agency'),
  requireAgencySubRoleScoped('id', 'owner', 'finance'),
  agencyPenaltyRuleController.list.bind(agencyPenaltyRuleController),
);
router.put(
  '/:id/penalty-rules',
  requireRole('admin', 'agency'),
  agencyOwnerOfParam,
  agencyPenaltyRuleController.save.bind(agencyPenaltyRuleController),
);

// Sealed-but-uncollected cancellation fees — the Finance head's reference on
// Payroll & PV. `finance` is the primary audience here, not an afterthought:
// this answers "what have I not billed yet?".
router.get(
  '/:id/uncharged',
  requireRole('admin', 'agency'),
  requireAgencySubRoleScoped('id', 'owner', 'finance'),
  agencyPenaltyRuleController.listUncharged.bind(agencyPenaltyRuleController),
);
// Accepting a week's breaches as owed, and marking them collected.
//
// Both are POSTs, never side effects of a read: sealing creates debts, so it
// must not be something a page does by loading.
//
// `finance` alongside `owner`, NOT owner-only. These are payroll bookkeeping —
// the panel they drive lives on Payroll & PV, which is the finance head's
// screen, and finance already holds `raisePv`. Owner-only made the list a
// reference finance could read but never act on: they would see what was owed,
// be unable to record it, and have to fetch the owner to press a button about
// their own payroll run.
//
// Note this is deliberately NOT the same gate as writing the RULES. Setting the
// fine schedule stays owner-only (PUT /:id/penalty-rules) — deciding what a
// breach costs is a policy call; recording that a breach happened at the price
// already set is bookkeeping.
const canRecordCharges = [
  requireRole('admin', 'agency'),
  requireAgencySubRoleScoped('id', 'owner', 'finance'),
];

router.get(
  '/:id/penalty-proposals',
  requireRole('admin', 'agency'),
  requireAgencySubRoleScoped('id', 'owner', 'finance'),
  agencyPenaltyRuleController.listProposals.bind(agencyPenaltyRuleController),
);
router.post(
  '/:id/penalties/seal',
  ...canRecordCharges,
  agencyPenaltyRuleController.sealWeek.bind(agencyPenaltyRuleController),
);
router.post(
  '/:id/uncharged/mark-charged',
  ...canRecordCharges,
  agencyPenaltyRuleController.markCharged.bind(agencyPenaltyRuleController),
);

// Broadcast a notice to selected PRs on this agency's roster.
//
// Owner-only (`agencyOwnerOfParam`), not owner+finance: this speaks to workers
// in the agency's name and is a roster action, not payroll bookkeeping.
//
// Scoped to `:id` for the reason repeated all over this file — a bare
// `requireRole('agency')` passes every agency owner for EVERY agency. That
// matters more here than on a read: the guard proves you own `:id`, and the
// controller then proves every recipient in the BODY is on that agency's
// roster. Neither check subsumes the other, exactly as with
// `/:id/members/:memberId`.
//
// POST, never GET: it writes a row per recipient and must not be something a
// page can do by loading.
router.post(
  '/:id/broadcast',
  requireRole('admin', 'agency'),
  agencyOwnerOfParam,
  agencyController.broadcastToPrs.bind(agencyController),
);

// Approvals write path — membership by user_id (not deprecated pr.id).
router.patch(
  '/:id/prs/:userId/approval',
  requireRole('admin', 'agency'),
  agencyOwnerOfParam,
  agencyController.setAgencyPrApproval.bind(agencyController),
);

// Membership IS identity. An agency_user row is what requireAgencySubRole and
// resolveOrgScope() both read to decide who a caller is, so whoever can write
// this table can grant themselves any sub-role in any agency. These four routes
// carried no gate, and addMember takes userId + subRole straight from the body
// with no ownership check — one POST made any signed-in account, a PR included,
// an active owner of any agency, which then satisfies every sub-role guard and
// hands over that agency's shifts, vouchers, sales and ratings.
//
// Reads stay open to the three org roles because the agency and outlet profile
// screens list their own members; a PR has no reason to enumerate an
// organisation's staff.
const canReadMembers = requireRole('admin', 'agency', 'outlet');

// Writes were admin-only while nothing called them. They are now open to the
// OWNER OF THE AGENCY IN `:id` — the widening the note above said to do
// "together with the UI, not before" — and that is safe only because three
// separate checks stack up:
//
//   1. `agencyOwnerOfParam` — you own the agency you addressed.
//   2. The controller re-reads `:memberId` and refuses (404) unless that row
//      belongs to the SAME agency. The scope guard cannot do this: it checks
//      `:id` while the write targets `:memberId`, so an owner could otherwise
//      pass their own agency and a foreign member id.
//   3. `guardMemberChange` refuses (409) any change that would leave the agency
//      with no active owner — removal, demotion or deactivation alike.
//
// Not restricted: an owner may appoint another owner inside their own agency,
// including handing ownership away. That is tenancy, not escalation.
const canWriteMembers = [requireRole('admin', 'agency'), agencyOwnerOfParam];

router.get('/:id/members', canReadMembers, agencyController.listMembers.bind(agencyController));
router.get(
  '/:id/invite-roles',
  ...canWriteMembers,
  agencyController.listInviteRoles.bind(agencyController),
);
router.post('/:id/members', ...canWriteMembers, agencyController.addMember.bind(agencyController));
router.put('/:id/members/:memberId', ...canWriteMembers, agencyController.updateMember.bind(agencyController));
router.delete('/:id/members/:memberId', ...canWriteMembers, agencyController.removeMember.bind(agencyController));

export default router;
