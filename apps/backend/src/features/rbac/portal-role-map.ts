import { portalRoleName } from '@/types/rbac-constant';

/**
 * Invites always attach the portal role (`agency` / `outlet`).
 * Owner / finance / ops is stored on membership.sub_role, not as separate roles.
 */
export function portalRoleNameForSubRole(
  org: 'agency' | 'outlet',
  _subRole: string,
): string {
  return org === 'agency' ? portalRoleName.AGENCY : portalRoleName.OUTLET;
}
