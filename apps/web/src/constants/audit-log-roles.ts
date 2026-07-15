import {
  Building2,
  FileText,
  Megaphone,
  Shield,
  Store,
} from 'lucide-react'

export const auditLogRoles = [
  {
    key: 'admin',
    label: 'Admin',
    description: 'View activity from platform administrators.',
    slug: 'admin-audit',
    icon: Shield,
  },
  {
    key: 'pr',
    label: 'PR',
    description: 'View activity from PR representatives.',
    slug: 'pr-audit',
    icon: Megaphone,
  },
  {
    key: 'outlet',
    label: 'Outlet',
    description: 'View activity from outlet users.',
    slug: 'outlet-audit',
    icon: Store,
  },
  {
    key: 'agency',
    label: 'Agency',
    description: 'View activity from agency users.',
    slug: 'agency-audit',
    icon: Building2,
  },
  {
    key: 'others',
    label: 'Others',
    description: 'View activity from other user types.',
    slug: 'others-audit',
    icon: FileText,
  },
] as const

export type AuditLogRoleKey = (typeof auditLogRoles)[number]['key']
export type AuditLogRoleSlug = `${AuditLogRoleKey}-audit`

export function getAuditLogRoleByKey(key: string) {
  return auditLogRoles.find((role) => role.key === key)
}

export function getAuditLogRoleBySlug(slug: string) {
  return auditLogRoles.find((role) => role.slug === slug)
}

export function isAuditLogRoleKey(key: string): key is AuditLogRoleKey {
  return auditLogRoles.some((role) => role.key === key)
}

export function isAuditLogRoleSlug(slug: string): slug is AuditLogRoleSlug {
  return getAuditLogRoleBySlug(slug) !== undefined
}
