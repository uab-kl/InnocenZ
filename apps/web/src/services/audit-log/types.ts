import type { Pagination } from '@/lib/pagination/pagination'

export interface AuditLog {
  auditLogId: number
  userId: string | null
  username: string | null
  role: string | null
  action: string
  entity: string
  entityId: string | null
  batchId?: string | null
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  ipAddress: string
  userAgent: string
  createdAt: string
}

export interface AuditLogsApiResponse {
  success: boolean
  message: string
  query: AuditLog[]
  pagination: Pagination
}

export interface AuditLogApiResponse {
  success: boolean
  message: string
  data: AuditLog
}

export interface AuditLogFiltersApiResponse {
  success: boolean
  message: string
  data: string[]
}

export type AuditLogSortField = 'CREATED_AT' | 'ACTION' | 'ENTITY' | 'USER_NAME'

export interface AuditLogsQueryParams {
  dateFrom?: string
  dateTo?: string
  userId?: string
  role?: string
  entity?: string
  entityId?: string
  action?: string
  page?: number
  pageSize?: number
  sortField?: AuditLogSortField
  sortDirection?: 'ASC' | 'DESC'
}
