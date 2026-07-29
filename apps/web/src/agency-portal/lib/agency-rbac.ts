import type { LucideIcon } from 'lucide-react';
import { iconForNav } from '@agency-portal/lib/lucide-label-icons';

/** Module 9 · Agency Owner vs Agency Finance */
export type AgencySubRole = 'agency_owner' | 'agency_finance';

export const AGENCY_SUB_ROLE_LABELS: Record<AgencySubRole, string> = {
  agency_owner: 'Agency Owner',
  agency_finance: 'Agency Finance',
};

type Permission =
  | 'viewHome'
  | 'approvePrSignups'
  | 'assignShifts'
  | 'managePr'
  | 'viewSettings'
  | 'editSettings'
  | 'viewPv'
  | 'raisePv'
  | 'viewCollections'
  | 'confirmReconciliation'
  | 'viewHistory'
  | 'viewWorkforce'
  | 'overrideSignedPv';

const ROLE_PERMISSIONS: Record<AgencySubRole, Permission[]> = {
  agency_owner: [
    'viewHome',
    'approvePrSignups',
    'assignShifts',
    'managePr',
    'viewSettings',
    'editSettings',
    'viewPv',
    'raisePv',
    'viewCollections',
    'confirmReconciliation',
    'viewHistory',
    'viewWorkforce',
    'overrideSignedPv',
  ],
  agency_finance: [
    'viewHome',
    'viewSettings',
    'viewPv',
    'raisePv',
    'overrideSignedPv',
    'viewCollections',
    'confirmReconciliation',
    'viewHistory',
    'viewWorkforce',
  ],
};

function resolveAgencySubRole(
  role: AgencySubRole | null | undefined,
): AgencySubRole {
  if (role && role in ROLE_PERMISSIONS) return role;
  return 'agency_owner';
}

export function agencyCan(
  role: AgencySubRole | null | undefined,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[resolveAgencySubRole(role)].includes(permission);
}

export type AgencyNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
};

const ALL_NAV: AgencyNavItem[] = [
  {
    to: '/agency',
    label: 'Today',
    icon: iconForNav('Today'),
    permission: 'viewHome',
  },
  {
    to: '/agency/roster',
    label: 'Roster',
    icon: iconForNav('Roster'),
    permission: 'viewWorkforce',
  },
  {
    to: '/agency/pending',
    label: 'Approvals',
    icon: iconForNav('Approvals'),
    permission: 'approvePrSignups',
  },
  {
    to: '/agency/pv',
    label: 'Payroll',
    icon: iconForNav('Payroll'),
    permission: 'viewPv',
  },
  // PHASE 2 — "Job Posting" (agency service bookings) is hidden for now.
  // Uncomment to bring it back; the /agency/special-service route itself is
  // untouched, so nothing else needs restoring.
  // {
  //   to: '/agency/special-service',
  //   label: 'Job Posting',
  //   icon: iconForNav('Job Posting'),
  //   permission: 'viewPv',
  // },
  {
    to: '/agency/history',
    label: 'History',
    icon: iconForNav('History'),
    permission: 'viewHistory',
  },
];

export function getAgencyNavItems(
  role: AgencySubRole | null | undefined,
): AgencyNavItem[] {
  const r = resolveAgencySubRole(role);
  return ALL_NAV.filter((item) => agencyCan(r, item.permission));
}

export function getAgencyDefaultRoute(
  role: AgencySubRole | null | undefined,
): string {
  const items = getAgencyNavItems(role);
  return items[0]?.to ?? '/agency/pv';
}

export function canAccessAgencyPath(
  role: AgencySubRole | null | undefined,
  pathname: string,
): boolean {
  const r = resolveAgencySubRole(role);
  if (pathname === '/agency' || pathname === '/agency/')
    return agencyCan(r, 'viewHome');
  if (pathname.startsWith('/agency/roster'))
    return agencyCan(r, 'viewWorkforce');
  if (pathname.startsWith('/agency/pv')) return agencyCan(r, 'viewPv');
  if (pathname.startsWith('/agency/special-service'))
    return agencyCan(r, 'viewPv');
  if (pathname.startsWith('/agency/history'))
    return agencyCan(r, 'viewHistory');
  if (pathname.startsWith('/agency/subscription'))
    return agencyCan(r, 'viewSettings');
  if (pathname.startsWith('/agency/pending'))
    return agencyCan(r, 'approvePrSignups');
  if (pathname.startsWith('/agency/prs')) return agencyCan(r, 'managePr');
  if (pathname.startsWith('/agency/outlets')) return agencyCan(r, 'managePr');
  if (pathname.startsWith('/agency/profile'))
    return agencyCan(r, 'viewSettings');
  if (pathname.startsWith('/agency/live')) return agencyCan(r, 'viewWorkforce');
  return true;
}

export type AgencyHomeTile = {
  to: string;
  title: string;
  desc: string;
  permission: Permission;
  badge?: string;
};
