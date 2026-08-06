import { portalRoleName } from '@/types/rbac-constant';

/**
 * Invites / API: membership lane label → portal RBAC role display name.
 */
export function portalRoleNameForSubRole(
  org: 'agency' | 'outlet',
  subRole: string,
): string {
  const n = subRole.trim().toLowerCase().replace(/[_\s]+/g, ' ');
  if (n === 'owner' || n.includes('owner')) return portalRoleName.OWNER;
  if (n.includes('finance')) return portalRoleName.FINANCE;
  if (org === 'outlet' && (n.includes('ops') || n.includes('operation'))) {
    return portalRoleName.OPS_HEAD;
  }
  return portalRoleName.OWNER;
}

/** Map an RBAC role name onto the API lane label (owner | finance | operations_head). */
export function inferMembershipSubRole(
  org: 'agency' | 'outlet',
  roleName: string,
): 'owner' | 'finance' | 'operations_head' {
  const n = roleName.trim().toLowerCase().replace(/[_\s]+/g, ' ');
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
export function laneFromRoleHints(
  portal: 'agency' | 'outlet',
  hints: RoleHint[],
): 'owner' | 'finance' | 'operations_head' {
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
