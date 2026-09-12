export const typeDefs = `#graphql
  type AuditLog {
    auditLogId: ID!
    userId: ID
    username: String
    role: String
    """Which surface the action came from — see audit-log.model.ts."""
    portal: String
    action: String!
    entity: String!
    entityId: ID
    oldData: JSON
    newData: JSON
    ipAddress: String!
    userAgent: String!
    createdAt: String!
  }

  type AuditLogPaginatedResponse {
    query: [AuditLog!]!
    pagination: Pagination!
  }

  input AuditLogFilterInput {
    dateFrom: String
    dateTo: String
    userId: ID
    entity: String
    entityId: ID
    action: String
    """
    The admin Audit Log's tab: admin | pr | outlet | agency, or the sentinel
    "others" for rows with no portal (everything written before 0164).
    Filtered server-side so the row count and the page agree.
    """
    portal: String
  }

  enum AuditLogSortField {
    CREATED_AT
    ACTION
    ENTITY
    USER_NAME
  }

  input AuditLogSort {
    field: AuditLogSortField!
    direction: SortDirection!
  }

  extend type Query {
    auditLogs(
      filter: AuditLogFilterInput
      sort: AuditLogSort
      pageSize: Int
      pageNumber: Int
    ): AuditLogPaginatedResponse! @auth

    auditLogActions: [String!]! @auth
    auditLogEntities: [String!]! @auth
  }
`;
