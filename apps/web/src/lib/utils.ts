import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Something went wrong'
}

export function formatRoleLabel(roleName: string): string {
  if (!roleName) return roleName
  return roleName.charAt(0).toUpperCase() + roleName.slice(1)
}

export function formatNumber(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : value
  if (num == null || Number.isNaN(num)) return '—'
  return new Intl.NumberFormat('en-MY').format(num)
}

export function formatPrice(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : value
  if (num == null || Number.isNaN(num)) return '—'
  return new Intl.NumberFormat('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export const statusColors: Record<string, string> = {
  active:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  inactive: 'border-muted-foreground/30 bg-muted text-muted-foreground',
}

export const auditActionColors: Record<string, string> = {
  CREATE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  UPDATE: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  DELETE: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  BULK_CREATE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  BULK_UPDATE: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  BULK_DELETE: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
}

export function getAuditActionBadgeColor(action: string) {
  return (
    auditActionColors[action] ??
    'border-muted-foreground/30 bg-muted text-muted-foreground'
  )
}

export function formatAuditDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const yyyy = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${mm}/${dd}/${yyyy} ${hours}:${minutes}:${seconds}`
  } catch {
    return dateString
  }
}

export function truncateId(id: string, length = 8) {
  if (id.length <= length) return id
  return `${id.slice(0, length)}...`
}

export function formatAuditEntity(entity: string) {
  if (entity === 'Role') return 'role'
  return entity
}
