import { graphqlRequest } from '@/lib/graphql-request'
import type {
  AuditLog,
  AuditLogFiltersApiResponse,
  AuditLogsApiResponse,
  AuditLogsQueryParams,
} from './types'

const KNOWN_AUDIT_ROLES = ['admin', 'pr', 'outlet', 'agency']

const AUDIT_LOGS_QUERY = `
  query AuditLogs(
    $filter: AuditLogFilterInput
    $sort: AuditLogSort
    $pageSize: Int
    $pageNumber: Int
  ) {
    auditLogs(
      filter: $filter
      sort: $sort
      pageSize: $pageSize
      pageNumber: $pageNumber
    ) {
      query {
        auditLogId
        userId
        username
        role
        action
        entity
        entityId
        oldData
        newData
        ipAddress
        userAgent
        createdAt
      }
      pagination {
        count
        totalCount
        currentPage
        totalPages
        hasNextPage
        hasPrevPage
      }
    }
  }
`

const AUDIT_LOG_ACTIONS_QUERY = `
  query AuditLogActions {
    auditLogActions
  }
`

const AUDIT_LOG_ENTITIES_QUERY = `
  query AuditLogEntities {
    auditLogEntities
  }
`

interface GraphqlAuditLog {
  auditLogId: string
  userId: string | null
  username: string | null
  role: string | null
  action: string
  entity: string
  entityId: string | null
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  ipAddress: string
  userAgent: string
  createdAt: string
}

function mapAuditLog(log: GraphqlAuditLog): AuditLog {
  return {
    auditLogId: Number.parseInt(log.auditLogId, 10),
    userId: log.userId,
    username: log.username,
    role: log.role,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    oldData: log.oldData,
    newData: log.newData,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
  }
}

function filterLogsByRole(logs: AuditLog[], role?: string): AuditLog[] {
  if (!role) return logs

  if (role === 'others') {
    return logs.filter(
      (log) => !log.role || !KNOWN_AUDIT_ROLES.includes(log.role),
    )
  }

  return logs.filter((log) => log.role === role)
}

export async function fetchAuditLogs(
  params: AuditLogsQueryParams = {},
): Promise<AuditLogsApiResponse> {
  const data = await graphqlRequest<{
    auditLogs: {
      query: GraphqlAuditLog[]
      pagination: AuditLogsApiResponse['pagination']
    }
  }>(AUDIT_LOGS_QUERY, {
    filter: {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      userId: params.userId,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
    },
    sort: params.sortField
      ? {
          field: params.sortField,
          direction: params.sortDirection ?? 'DESC',
        }
      : undefined,
    pageSize: params.pageSize,
    pageNumber: params.page,
  })

  const filteredQuery = filterLogsByRole(
    data.auditLogs.query.map(mapAuditLog),
    params.role,
  )

  return {
    success: true,
    message: 'OK',
    query: filteredQuery,
    pagination: data.auditLogs.pagination,
  }
}

export async function fetchAuditLogActions(): Promise<AuditLogFiltersApiResponse> {
  const data = await graphqlRequest<{ auditLogActions: string[] }>(
    AUDIT_LOG_ACTIONS_QUERY,
  )

  return {
    success: true,
    message: 'OK',
    data: data.auditLogActions,
  }
}

export async function fetchAuditLogEntities(): Promise<AuditLogFiltersApiResponse> {
  const data = await graphqlRequest<{ auditLogEntities: string[] }>(
    AUDIT_LOG_ENTITIES_QUERY,
  )

  return {
    success: true,
    message: 'OK',
    data: data.auditLogEntities,
  }
}
