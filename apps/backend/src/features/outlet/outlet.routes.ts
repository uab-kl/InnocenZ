import { Router } from 'express';
import { outletController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import {
  outletOwnerOfParam,
  refuseOrgStatusChange,
  requireOrgMembershipByParam,
} from '@/middlewares/require-sub-role.js';

const router = Router();

// Reads are open to the three org roles and closed to PR. A venue record carries
// the address, SSM no, business licence and geo-fence centre, so an ungated read
// let any signed-in account — a PR included — enumerate every outlet on the
// platform. Callers are all admin or agency screens (admin dashboard/user-
// management, agency roster + geo-fence + auto-assign) plus the outlet operator's
// own profile and session bootstrap; `outlet` is in the list for that last case.
// apps/mobile touches no /outlet route (only /outlet-swap/mine), so PR is safe to
// exclude — verified against every caller before gating, per the lesson from the
// outlet-workspace revert (4c7151c).
const canReadOutlet = requireRole('admin', 'agency', 'outlet');

// Outlet CRUD
router.get('/', canReadOutlet, outletController.list.bind(outletController));
// Must precede `/:id` so "memberships" isn't captured as an outlet id.
router.get(
  '/memberships',
  canReadOutlet,
  outletController.listMemberships.bind(outletController),
);
// Same reason: "geocode" must not be captured as an outlet id.
router.get(
  '/geocode',
  canReadOutlet,
  outletController.geocode.bind(outletController),
);
// ADMIN — the cross-venue "Team members" screen. Declared BEFORE '/:id',
// or 'team-members' is captured as an outlet id and 404s.
router.get(
  '/team-members',
  requireRole('admin'),
  outletController.listTeamMembers.bind(outletController),
);

/*
 * ⚠️ SCOPED — the LIST was given a tenant term on 12 Sep and this single read
 * was left behind it, which is the more direct leak of the two: it needs no
 * paging and no guessing, just an id.
 *
 * `canReadOutlet` is `requireRole('admin','agency','outlet')`, and `getById`
 * never reads `req.user`, so ANY agency or outlet account could fetch ANY venue
 * and receive every column — `ssmNo`, `businessLicense`, the owner's contact
 * name, email and phone, the full address, and the geo-fence pin that decides
 * where that venue's staff may clock in.
 *
 * CALLERS VERIFIED FIRST: `use-outlet-geo-fence` and `use-outlet-profile` both
 * read the venue the operator is signed in to, and the third consumer is an
 * admin screen. No agency screen calls it — an agency that needs a venue's NAME
 * has `GET /outlet`, which now returns every venue it has ever been linked to.
 */
router.get(
  '/:id',
  canReadOutlet,
  requireOrgMembershipByParam('outlet', 'id'),
  outletController.getById.bind(outletController),
);
/*
 * ⚠️ THE SIBLING THE SCOPE FIX WALKED PAST — confirmed live 13 Sep 2026.
 *
 * `GET /:id` directly above was given `requireOrgMembershipByParam` and this
 * one, four lines below it, was left on `canReadOutlet` alone. Proved against
 * the running server with an outlet Director at UAB Emhub asking for Velvet 23:
 *
 *     GET /outlet/<velvet>            -> 403   (correctly refused)
 *     GET /outlet/<velvet>/geocode    -> 200   (the whole address + coordinates)
 *
 * and the body carried that venue's full street address as `query` plus
 * ROOFTOP-precision lat/lng. That is the geo-fence centre: the point the 50 m
 * check-in rule is measured from, and a rival's exact front door.
 *
 * The handler is called `geocodeOwnAddress` — the name already said whose
 * address it is for. Nothing legitimate asks for another venue's: both callers
 * (`use-outlet-geo-fence`, `use-outlet-profile`) geocode the venue the operator
 * is signed in to.
 *
 * The lesson this repeats — a fix named after one symptom hides its siblings.
 * When a guard goes onto one route, walk EVERY route sharing that `:id`.
 */
router.get(
  '/:id/geocode',
  canReadOutlet,
  requireOrgMembershipByParam('outlet', 'id'),
  outletController.geocodeOwnAddress.bind(outletController),
);
// Admin-only: creating a venue is an onboarding act, and `create` stamps
// status='pending_review' for an admin to approve. No client calls this — every
// existing row came from a seed script or admin. If agency-side outlet onboarding
// ever ships (the `onboarded_by_agency_id` column anticipates it), widen to
// 'agency' together with that UI, not before.
router.post('/', requireAdmin, outletController.create.bind(outletController));
// Editing the venue record is outletCan('editSettings') — owner only; Finance
// and Ops are both excluded. Neither of these carried ANY role gate before, so
// any signed-in account, a PR included, could rewrite an outlet or move the
// geo-fence centre the 50 m check-in rule is measured against.
const canEditOutlet = requireRole('admin', 'outlet');

// The owner check is SCOPED to `:id`. `outletOwnerOnly` asked only "are you an
// owner?" — true of every outlet owner for every venue — so one operator could
// rewrite another venue's record AND move its geo-fence centre, which is what
// the 50 m check-in rule is measured against. Found while wiring the outlet
// Settings save; the gate was never wrong about the role, only about the venue.
// `refuseOrgStatusChange` only HERE, not on the member routes: `outlet.status`
// is the admin approve/suspend lane, while `outlet_user.status` is an owner's
// to set.
router.put(
  '/:id',
  canEditOutlet,
  outletOwnerOfParam,
  refuseOrgStatusChange(),
  outletController.update.bind(outletController),
);
router.patch(
  '/:id/geo-fence',
  canEditOutlet,
  outletOwnerOfParam,
  outletController.setGeoFence.bind(outletController),
);
// Clearing the pin switches attendance verification OFF for the venue, so it
// carries the same owner-only gate as setting one. A DELETE rather than a PATCH
// with null coordinates on purpose: UpdateGeoFenceSchema stays strict, so a
// malformed PATCH still 400s instead of silently unfencing a venue.
router.delete(
  '/:id/geo-fence',
  canEditOutlet,
  outletOwnerOfParam,
  outletController.clearGeoFence.bind(outletController),
);
// The un-cropped original behind the venue's logo, so "Adjust crop" survives a
// reload. Guarded like editing the logo — `canEditOutlet` + `outletOwnerOfParam`
// — because only someone who may REPLACE the logo has any use for re-framing
// it, and the original may show more of the picture than the logo does.
router.get(
  '/:id/logo-source',
  canEditOutlet,
  outletOwnerOfParam,
  outletController.getLogoSource.bind(outletController),
);
router.patch(
  '/:id/approve',
  requireAdmin,
  outletController.approve.bind(outletController),
);
router.patch(
  '/:id/suspend',
  requireAdmin,
  outletController.suspend.bind(outletController),
);
// The hard off switch: `inactive` denies every login and ends open sessions;
// `suspend` above does not. Reactivation is `/approve`.
router.patch(
  '/:id/deactivate',
  requireAdmin,
  outletController.deactivate.bind(outletController),
);

// Outlet members. Same reasoning as the agency member routes: an outlet_user row
// is what requireOutletSubRole and resolveOrgScope() read to decide who a caller
// is, addMember trusts userId + subRole from the body, and none of it was gated —
// so one POST made any signed-in account an active owner of any venue. Writes are
// admin-only (no client calls them; every existing row came from a seed script);
// reads stay open to the three org roles for the profile screens.
const canReadMembers = requireRole('admin', 'agency', 'outlet');

// Writes widened from admin-only to the OWNER OF THE OUTLET IN `:id`, on the
// same three stacked checks as the agency member routes: the scope guard proves
// you own the venue you addressed, the controller refuses (404) a `:memberId`
// belonging to another venue — the scope guard checks `:id`, not the row being
// written — and `guardMemberChange` refuses (409) anything that would leave the
// venue with no active owner.
const canWriteMembers = [requireRole('admin', 'outlet'), outletOwnerOfParam];

// Membership scope, not just a role — the twin of the agency members read.
router.get(
  '/:id/members',
  canReadMembers,
  requireOrgMembershipByParam('outlet', 'id'),
  outletController.listMembers.bind(outletController),
);
router.get(
  '/:id/invite-roles',
  ...canWriteMembers,
  outletController.listInviteRoles.bind(outletController),
);
router.post(
  '/:id/members',
  ...canWriteMembers,
  outletController.addMember.bind(outletController),
);
router.put(
  '/:id/members/:memberId',
  ...canWriteMembers,
  outletController.updateMember.bind(outletController),
);
router.delete(
  '/:id/members/:memberId',
  ...canWriteMembers,
  outletController.removeMember.bind(outletController),
);

export default router;
