import { portalRoleName } from '@/types/rbac-constant';

/**
 * Invites / fallbacks: membership.sub_role → portal RBAC role display name.
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

/** Map an RBAC role name onto the membership.sub_role enum. */
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
