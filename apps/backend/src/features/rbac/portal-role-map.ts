import { portalRoleName } from '@/types/rbac-constant';

/**
 * Invites / API: membership lane label → portal RBAC role display name.
 */
/**
 * `director` (view only) and `guarantor` (owner-equal) exist on BOTH portals.
 * `operations_head` is outlet only — an agency has never issued it.
 */
export type AgencyLane = 'owner' | 'finance' | 'director' | 'guarantor';

export type OutletLane = AgencyLane | 'operations_head';

export type OrgLane = AgencyLane | OutletLane;

export function portalRoleNameForSubRole(
  org: 'agency' | 'outlet',
  subRole: string,
): string {
  const n = subRole.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  // Both tested BEFORE owner, and on BOTH portals. 'guarantor' does not contain
  // the substring 'owner', but this function's fallback DOES return Owner — so
  // an unmatched lane is granted everything, and a new lane must be caught
  // before it can fall that far.
  if (n.includes('director')) return portalRoleName.DIRECTOR;
  if (n.includes('guarantor')) return portalRoleName.GUARANTOR;
  if (n === 'owner' || n.includes('owner')) return portalRoleName.OWNER;
  if (n.includes('finance')) return portalRoleName.FINANCE;
  if (org === 'outlet' && (n.includes('ops') || n.includes('operation'))) {
    return portalRoleName.OPS_HEAD;
  }
  return portalRoleName.OWNER;
}

/**
 * Map an RBAC role name onto the API lane label.
 *
 * Overloaded by org so the caller gets the lanes that org can actually issue:
 * asking about an agency can only ever answer owner or finance, and the agency
 * code that consumes this should not have to widen for outlet-only lanes.
 */
export function inferMembershipSubRole(org: 'agency', roleName: string): AgencyLane;
export function inferMembershipSubRole(org: 'outlet', roleName: string): OutletLane;
export function inferMembershipSubRole(
  org: 'agency' | 'outlet',
  roleName: string,
): OrgLane;
export function inferMembershipSubRole(
  org: 'agency' | 'outlet',
  roleName: string,
): OrgLane {
  const n = roleName.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  // Ahead of the owner test for the same reason — and here it matters twice
  // over, because this function's fallbacks are WRITE lanes on both portals:
  // `operations_head` for an outlet, `finance` for an agency. A Director
  // dropping through would be able to post jobs at a venue, or raise a payment
  // voucher at an agency.
  if (n.includes('director')) return 'director';
  if (n.includes('guarantor')) return 'guarantor';
  if (
    n === 'owner' ||
    n.endsWith(' owner') ||
    n.includes('owner') ||
    n === portalRoleName.AGENCY ||
    n === portalRoleName.OUTLET
  ) {
    return 'owner';
  }
  if (n.includes('finance')) return 'finance';
  if (org === 'outlet' && (n.includes('ops') || n.includes('operation'))) {
    return 'operations_head';
  }
  return org === 'agency' ? 'finance' : 'operations_head';
}

type RoleHint = { portalCode: string | null; roleName: string };

/** Pick the portal lane for a user from their `user_role` rows. */
export function laneFromRoleHints(portal: 'agency', hints: RoleHint[]): AgencyLane;
export function laneFromRoleHints(portal: 'outlet', hints: RoleHint[]): OutletLane;
export function laneFromRoleHints(
  portal: 'agency' | 'outlet',
  hints: RoleHint[],
): OrgLane;
export function laneFromRoleHints(
  portal: 'agency' | 'outlet',
  hints: RoleHint[],
): OrgLane {
  const match =
    hints.find((r) => r.portalCode === portal) ??
    hints.find((r) =>
      portal === 'agency'
        ? r.roleName === portalRoleName.AGENCY ||
          r.roleName.startsWith('agency_') ||
          r.roleName.toLowerCase().includes('agency')
        : r.roleName === portalRoleName.OUTLET ||
          r.roleName.startsWith('outlet_') ||
          r.roleName.toLowerCase().includes('outlet'),
    );
  return inferMembershipSubRole(portal, match?.roleName ?? portalRoleName.OWNER);
}
