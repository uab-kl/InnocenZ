import type { LimitType } from '@/services/subscription'

import { formatNumber } from '@/lib/utils'

function formatLimitValue(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return formatNumber(Number(value))
  }
  return value != null ? String(value) : ''
}

export function formatLimitConfigSummary(
  configSchema: Record<string, unknown> | null | undefined,
): string {
  if (!configSchema) return '—'

  const type = configSchema.type
  const value = configSchema.default
  const unit = configSchema.unit != null ? String(configSchema.unit) : ''
  const period = configSchema.period != null ? String(configSchema.period) : ''
  const per = configSchema.per != null ? String(configSchema.per) : ''

  if (type === 'rate' && value != null) {
    const periodLabel = period ? ` / ${period.replace(/_/g, ' ')}` : ''
    const perLabel = per ? ` per ${per.replace(/_/g, ' ')}` : ''
    return `${formatLimitValue(value)} ${unit}${perLabel}${periodLabel}`.trim()
  }

  if (type === 'number' && value != null) {
    const periodLabel = period ? ` / ${period.replace(/_/g, ' ')}` : ''
    return `${formatLimitValue(value)} ${unit}${periodLabel}`.trim()
  }

  if (type === 'boolean') {
    return value === true ? 'Yes' : value === false ? 'No' : '—'
  }

  if (type === 'text' && value != null) {
    return String(value)
  }

  if (value != null) {
    return formatLimitValue(value) || '—'
  }

  return '—'
}

export function findLimitTypeById(
  limitTypes: LimitType[],
  id: string | null | undefined,
): LimitType | undefined {
  if (!id) return undefined
  return limitTypes.find((lt) => lt.id === id)
}

export const PR_PV_SETUP_STEPS = [
  {
    title: 'Max PRs on roster (20)',
    limitType: 'max_pr_roster',
    templateId: 'max-pr-roster',
  },
  {
    title: '1 PV per active PR per week',
    limitType: 'pv_per_active_pr_per_week',
    templateId: 'pv-per-active-pr-week',
  },
  {
    title: 'Plan allows 25 PV / week',
    limitType: 'max_pv_per_week',
    templateId: 'max-pv-per-week',
  },
] as const
