import { Key, LayoutGrid, Shield } from 'lucide-react'

export const rbacSections = [
  {
    key: 'role',
    title: 'Role',
    description: 'Manage roles and assign access levels.',
    href: '/rbac/role',
    icon: Shield,
  },
  {
    key: 'permission',
    title: 'Permission',
    description: 'Manage permissions and access rules.',
    href: '/rbac/permission',
    icon: Key,
  },
  {
    key: 'module',
    title: 'Module',
    description: 'Manage application modules and features.',
    href: '/rbac/module',
    icon: LayoutGrid,
  },
] as const

export type RbacSection = (typeof rbacSections)[number]
export type RbacSectionKey = RbacSection['key']

export function getRbacSectionByKey(key: string) {
  return rbacSections.find((section) => section.key === key)
}
