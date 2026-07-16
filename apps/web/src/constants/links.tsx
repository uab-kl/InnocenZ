import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Handshake,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { z } from 'zod';
import { businessSections } from '@/constants/business-sections';
import { rbacSections } from '@/constants/rbac-sections';
import { userTypes } from '@/constants/user-types';

const ChildNavLinkSchema = z.object({
  key: z.string(),
  title: z.string(),
  label: z.string().optional(),
  icon: z.any(),
  variant: z.enum(['default', 'ghost']),
  href: z.string(),
  allowedPermission: z.array(z.string()),
});

type NavLinkSchemaType = z.infer<typeof ChildNavLinkSchema> & {
  children?: NavLinkSchemaType[];
};

const NavLinkSchema: z.ZodType<NavLinkSchemaType[]> = z.array(
  ChildNavLinkSchema.extend({
    children: z.lazy(() => NavLinkSchema.optional()),
  }),
);

export { NavLinkSchema, type NavLinkSchemaType };

export type SidebarNavItem = {
  key: string;
  title: string;
  href: string;
  icon: LucideIcon;
  allowedPermission: string[];
  badge?: number;
};

export type SidebarSection = {
  key: string;
  label: string;
  items: SidebarNavItem[];
};

export const sidebarSections: SidebarSection[] = [
  {
    key: 'overview',
    label: 'Overview',
    items: [
      {
        key: 'sidebar-dashboard',
        title: 'Dashboard',
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        allowedPermission: ['*'],
      },
      {
        key: 'sidebar-settings',
        title: 'Settings',
        href: '/admin/settings',
        icon: Settings,
        allowedPermission: ['*'],
      },
    ],
  },
  {
    key: 'operation',
    label: 'Operation',
    items: [
      ...rbacSections.map((section) => ({
        key: `sidebar-rbac-${section.key}`,
        title: section.title,
        href: section.href,
        icon: section.icon,
        allowedPermission: ['*'],
      })),
      ...userTypes.map((type) => ({
        key: `sidebar-user-${type.key}`,
        title: type.title,
        href: type.href,
        icon: type.icon,
        allowedPermission: ['*'],
      })),
    ],
  },
  {
    key: 'service',
    label: 'Service',
    items: [
      {
        key: 'sidebar-service-requests',
        title: 'Plan Request',
        href: '/admin/service/requests',
        icon: Handshake,
        allowedPermission: ['*'],
      },
      {
        key: 'sidebar-service-other',
        title: 'Jobs & Special Services',
        href: '/admin/service/other',
        icon: LayoutGrid,
        allowedPermission: ['*'],
      },
    ],
  },
  {
    key: 'subscription',
    label: 'Subscription',
    items: businessSections.map((section) => ({
      key: `sidebar-business-${section.key}`,
      title: section.title,
      href: section.href,
      icon: section.icon,
      allowedPermission: ['*'],
    })),
  },
  {
    key: 'security',
    label: 'Security',
    items: [
      {
        key: 'sidebar-audit-log',
        title: 'Audit Log',
        href: '/admin/audit-log',
        icon: FileText,
        allowedPermission: ['*'],
      },
    ],
  },
];

export const allNavigationItems: NavLinkSchemaType[] = [
  {
    key: 'sidebar-dashboard',
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
    allowedPermission: ['*'],
    variant: 'default',
  },
  {
    key: 'sidebar-user-management',
    title: 'User',
    href: '/admin/user-management/admin',
    icon: Users,
    allowedPermission: ['*'],
    variant: 'default',
    children: userTypes.map((type) => ({
      key: `sidebar-user-${type.key}`,
      title: type.title,
      href: type.href,
      icon: type.icon,
      allowedPermission: ['*'],
      variant: 'default' as const,
    })),
  },
  {
    key: 'sidebar-rbac',
    title: 'RBAC',
    href: '/admin/rbac/role',
    icon: Shield,
    allowedPermission: ['*'],
    variant: 'default',
    children: rbacSections.map((section) => ({
      key: `sidebar-rbac-${section.key}`,
      title: section.title,
      href: section.href,
      icon: section.icon,
      allowedPermission: ['*'],
      variant: 'default' as const,
    })),
  },
  {
    key: 'sidebar-audit-log',
    title: 'Audit Log',
    href: '/admin/audit-log',
    icon: FileText,
    allowedPermission: ['*'],
    variant: 'default',
  },
];
