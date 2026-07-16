import type { Role } from '@agency-portal/lib/store';
import { DEFAULT_AGENCY_OWNER } from '@agency-portal/lib/agency-demo';
import {
  getAgencyDefaultRoute,
  type AgencySubRole,
} from '@agency-portal/lib/agency-rbac';
import { DEFAULT_OUTLET_OWNER } from '@agency-portal/lib/outlet-demo';
import {
  getOutletDefaultRoute,
  type OutletSubRole,
} from '@agency-portal/lib/outlet-rbac';
import type { PrSubRole } from '@agency-portal/lib/pr-demo';

export type SignInPortal = 'pr' | 'outlet' | 'agency';

export const PORTAL_SIGNIN_LABELS: Record<SignInPortal, string> = {
  pr: 'PR',
  outlet: 'Outlet',
  agency: 'PR Agency',
};

export type PortalSubRoleItem = {
  label: string;
  role: Role;
  outletSubRole?: OutletSubRole;
  agencySubRole?: AgencySubRole;
  prSubRole?: PrSubRole;
};

export const OUTLET_SIGNIN_SUB_ROLES: PortalSubRoleItem[] = [
  { label: 'Owner', role: 'vendor', outletSubRole: 'outlet_owner' },
  { label: 'Finance', role: 'vendor', outletSubRole: 'outlet_finance' },
  { label: 'Operations Head', role: 'vendor', outletSubRole: 'outlet_ops' },
];

export const AGENCY_SIGNIN_SUB_ROLES: PortalSubRoleItem[] = [
  { label: 'Owner', role: 'agency', agencySubRole: 'agency_owner' },
  { label: 'Finance', role: 'agency', agencySubRole: 'agency_finance' },
];

export function parseSignInPortal(value: unknown): SignInPortal {
  if (value === 'outlet' || value === 'agency') return value;
  return 'pr';
}

export function portalHomePath(
  portal: SignInPortal,
  item?: PortalSubRoleItem,
): string {
  if (portal === 'outlet') {
    return getOutletDefaultRoute(item?.outletSubRole ?? 'outlet_owner');
  }
  if (portal === 'agency') {
    return getAgencyDefaultRoute(item?.agencySubRole ?? 'agency_owner');
  }
  return '/host';
}

export function subRolesForPortal(portal: SignInPortal): PortalSubRoleItem[] {
  if (portal === 'outlet') return OUTLET_SIGNIN_SUB_ROLES;
  if (portal === 'agency') return AGENCY_SIGNIN_SUB_ROLES;
  return [];
}

export function portalUsesEmailSignIn(portal: SignInPortal): boolean {
  return portal === 'outlet' || portal === 'agency';
}

export function defaultSignInIdentifier(portal: SignInPortal): string {
  if (portal === 'outlet') return DEFAULT_OUTLET_OWNER.email;
  if (portal === 'agency') return DEFAULT_AGENCY_OWNER.email;
  return '60123456789';
}

export function resolveSignInEmail(value: string): string | null {
  const email = value.trim();
  if (!email || !email.includes('@')) return null;
  return email;
}

export const PORTAL_AUTH_TAGLINES: Record<'outlet' | 'agency', string> = {
  outlet: 'Staff tonight, log sales, and seal shifts from one desktop portal.',
  agency:
    'Roster PRs, fill outlet demand, and sync payroll from one desktop portal.',
};
