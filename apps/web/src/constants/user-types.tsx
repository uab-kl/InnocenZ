import { Building2, Megaphone, Shield, Store } from 'lucide-react';

export const userTypes = [
  {
    key: 'admin',
    title: 'Admin',
    description: 'Manage platform administrators and system operators.',
    href: '/admin/user-management/admin',
    icon: Shield,
  },
  {
    key: 'agency',
    title: 'PR Agency',
    description:
      'Approve and manage PR Agency organizations and their members.',
    href: '/admin/user-management/agency',
    icon: Building2,
  },
  {
    key: 'outlet',
    title: 'Outlet',
    description: 'Approve and manage Outlet organizations and their members.',
    href: '/admin/user-management/outlet',
    icon: Store,
  },
  {
    key: 'pr',
    title: 'PR',
    description: 'View PR accounts registered on the platform.',
    href: '/admin/user-management/pr',
    icon: Megaphone,
  },
] as const;

export type UserTypeKey = (typeof userTypes)[number]['key'];

export function getUserTypeByKey(key: string) {
  return userTypes.find((type) => type.key === key);
}
