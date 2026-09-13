import { Router } from 'express';
import {
  agencyController,
  agencyPenaltyRuleController,
} from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import {
  agencyOwnerOfParam,
  refuseOrgStatusChange,
  requireAgencySubRoleScoped,
  requireOrgMembershipByParam,
} from '@/middlewares/require-sub-role.js';

const router = Router();

/*
 * ⚠️ ADMIN ONLY. The note that used to sit here said "admin + agency only —
 * outlet must not enumerate agencies", which asked the wrong question: it
 * worried about the OUTLET portal and never about one agency reading another.
 *
 * `requireRole('admin','agency')` has no tenant term and `list` never consults
 * `req.user`, so any agency lane — a view-only Director included — could
 * enumerate every agency on the platform. Proved live as Atlas's Finance head:
 * five rows came back, four of them rivals, each carrying `ssmNo` — the company
 * registration number. This is the same shape as the `GET /user` leak: a role
 * gate standing in for a scope check, behind a comment that had outlived it.
 *
 * CALLERS VERIFIED FIRST, the way this file's own history demands. Every
 * `fetchAgencies` call site is an ADMIN screen — routes/admin/dashboard,
 * business/history, rbac/pending, user-management/agency — plus
 * `use-sidebar-badges`, which only the admin sidebar and routes/admin/rbac
 * render. The agency portal never lists agencies, and the phone calls no
 * `/agency` route at all.
 *
 * An agency that needs its OWN record still has `GET /agency/:id`, which is
 * membership-scoped, and `/agency/memberships` below.
 */
router.get('/', requireAdmin, agencyController.list.bind(agencyController));
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
// ADMIN — the cross-agency "Team members" screen. Declared BEFORE '/:id',
// or 'team-members' is captured as an agency id and 404s.
router.get(
  '/team-members',
  requireAdmin,
  agencyController.listTeamMembers.bind(agencyController),
);

/*
 * ⚠️ A ROLE GATE IS NOT A SCOPE CHECK — this read carried nothing else.
 *
 * `requireRole('admin','agency','outlet')` expands to "any lane on either
 * portal", and `getById` never reads `req.user`, so ANY signed-in agency or
 * outlet account could fetch ANY agency by id and receive every column:
 * `ssm_no`, `business_license`, `registration_no_old`, the owner's
 * `contact_name` / `contact_email` / `contact_phone` and the full company
 * address. A rival agency's registration and its owner's mobile number are
 * commercial information, not a directory entry.
 *
 * CALLERS VERIFIED FIRST (the `GET /user` lesson): the only consumers are
 * `use-agency-profile` and `use-pv-issuer` — both reading the caller's OWN
 * agency — plus two ADMIN screens. Nothing on the outlet portal calls it, so
 * scoping to membership refuses nobody who legitimately asks. A venue that
 * needs the agencies it may work with already has `/agency-outlet/directory`.
 *
 * `requireOrgMembershipByParam` admits an admin outright and otherwise demands
 * an ACTIVE membership of the agency named in the path.
 */
router.get(
  '/:id',
  requireRole('admin', 'agency', 'outlet'),
  requireOrgMembershipByParam('agency', 'id'),
  agencyController.getById.bind(agencyController),
);
/*
 * ⚠️ ADMIN ONLY — the twin of `POST /outlet`, and for the same reason.
 *
 * `requireRole('admin','agency')` admits EVERY agency lane, so a view-only
 * Director could create an agency record — and `create` also writes the first
 * membership row, so it is an ownership-granting write, not a directory entry.
 * Nothing about being staff at one agency should let you conjure another.
 *
 * CALLERS VERIFIED FIRST: `services/agency/agency.ts` exports no create at all,
 * and nothing in `apps/web/src` POSTs to `/agency` — every existing row came
 * from a seed script or an admin, exactly as on the outlet side. If agency
 * self-signup ever ships it goes through the public `/auth/register` path,
 * which is a different route with its own rules, not this one.
 */
router.post('/', requireAdmin, agencyController.create.bind(agencyController));
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
// The un-cropped original behind the agency's logo, so "Adjust crop" survives a
// reload. Guarded exactly like editing the record — `requireRole` +
// `agencyOwnerOfParam`, the SCOPED owner check — because only someone who may
// replace the logo has any use for re-framing it, and the original may show
// more of the picture than the logo does.
router.get(
  '/:id/logo-source',
  requireRole('admin', 'agency'),
  agencyOwnerOfParam,
  agencyController.getLogoSource.bind(agencyController),
);
router.patch(
  '/:id/approve',
  requireAdmin,
  agencyController.approve.bind(agencyController),
);
router.patch(
  '/:id/suspend',
  requireAdmin,
  agencyController.suspend.bind(agencyController),
);
// The hard off switch: `inactive` denies every login and ends open sessions;
// `suspend` above does not. Reactivation is `/approve`.
router.patch(
  '/:id/deactivate',
  requireAdmin,
  agencyController.deactivate.bind(agencyController),
);

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
/*
 * ⚠️ `director` ALONGSIDE owner and finance — READ ONLY, and only here.
 *
 * The Director holds `approvals:read`, so they are given the Approvals sidebar
 * item, admitted by the route guard, and shown the page — and then the PR
 * sign-up queue behind it is fed by THIS endpoint, which 403'd them. The queue
 * was therefore permanently empty for the one lane whose entire job is to look
 * at it: a nav item, a page and a badge, all leading to a list that could never
 * have rows.
 *
 * This is the same correction already made twice below, for the same reason and
 * in the same words: `/:id/uncharged` and `/:id/penalty-proposals` both added
 * `director` for READ because "a Director oversees; reading what has not been
 * billed is exactly that". Every WRITE on a sign-up stays owner-only.
 *
 * ⚠️ This route returns IC document keys, and widening it is a privacy decision,
 * not a convenience one. It is defensible precisely because reviewing a sign-up
 * IS looking at who is asking to join — that is what the Approvals screen is
 * for, and the Director is an org member the owner has given oversight to. It
 * stays SCOPED to the agency in `:id`, so this widens the lane and never the
 * organisation.
 */
router.get(
  '/:id/prs',
  requireRole('admin', 'agency'),
  requireAgencySubRoleScoped('id', 'owner', 'finance', 'director'),
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
  // `director` alongside owner and finance — READ ONLY, and only here.
  //
  // Payroll & PV is gated on `viewPv` (`payment_voucher:read`), which the
  // Director holds, so they open the page — and then this panel's two reads,
  // gated by LANE rather than by permission, 403'd and left a permanent red
  // "could not load uncharged fees" card on a screen they are meant to see.
  // A Director oversees; reading what has not been billed is exactly that.
  // Every WRITE below stays owner/finance: sealing a debt is not oversight.
  requireAgencySubRoleScoped('id', 'owner', 'finance', 'director'),
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
  // `director` alongside owner and finance — READ ONLY, and only here.
  //
  // Payroll & PV is gated on `viewPv` (`payment_voucher:read`), which the
  // Director holds, so they open the page — and then this panel's two reads,
  // gated by LANE rather than by permission, 403'd and left a permanent red
  // "could not load uncharged fees" card on a screen they are meant to see.
  // A Director oversees; reading what has not been billed is exactly that.
  // Every WRITE below stays owner/finance: sealing a debt is not oversight.
  requireAgencySubRoleScoped('id', 'owner', 'finance', 'director'),
  agencyPenaltyRuleController.listProposals.bind(agencyPenaltyRuleController),
);
router.post(
  '/:id/penalties/seal',
  ...canRecordCharges,
  agencyPenaltyRuleController.sealWeek.bind(agencyPenaltyRuleController),
);
// VOID one recorded penalty (0151). Same gate as recording one, and for the
// reason the waive below shares it: cancelling a charge at a price policy
// already set is bookkeeping, not a policy decision. This is the half that
// makes automatic sealing acceptable — a charge nobody chose has to be one
// somebody can undo.
//
// 4-segment path, so it cannot collide with '/:id/penalties/seal' (3).
router.post(
  '/:id/penalties/:chargeId/void',
  ...canRecordCharges,
  agencyPenaltyRuleController.voidCharge.bind(agencyPenaltyRuleController),
);
router.post(
  '/:id/uncharged/mark-charged',
  ...canRecordCharges,
  agencyPenaltyRuleController.markCharged.bind(agencyPenaltyRuleController),
);
// FORGIVE one cancellation fee (0130). Same gate as recording a charge, and for
// the same reason: taking a sealed fee off a voucher is bookkeeping at a price
// policy already set, not a policy decision. Owner AND finance, both scoped to
// this agency by `requireAgencySubRoleScoped` — and the repository re-scopes the
// UPDATE itself, because a guard that checks the role but not the ORG is how one
// agency ends up editing another's rows.
//
// 4-segment path, so it cannot collide with '/:id/uncharged' (2) or
// '/:id/uncharged/mark-charged' (3).
router.post(
  '/:id/uncharged/:assignmentId/waive',
  ...canRecordCharges,
  agencyPenaltyRuleController.waiveCancelFee.bind(agencyPenaltyRuleController),
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

// Membership scope, not just a role: the gate above proves you are AN agency,
// this proves it is THIS one. Without it any agency or outlet token read a
// rival's whole staff list, with usernames, emails and phone numbers.
router.get(
  '/:id/members',
  canReadMembers,
  requireOrgMembershipByParam('agency', 'id'),
  agencyController.listMembers.bind(agencyController),
);
router.get(
  '/:id/invite-roles',
  ...canWriteMembers,
  agencyController.listInviteRoles.bind(agencyController),
);
router.post(
  '/:id/members',
  ...canWriteMembers,
  agencyController.addMember.bind(agencyController),
);
router.put(
  '/:id/members/:memberId',
  ...canWriteMembers,
  agencyController.updateMember.bind(agencyController),
);
router.delete(
  '/:id/members/:memberId',
  ...canWriteMembers,
  agencyController.removeMember.bind(agencyController),
);

export default router;
