export const typeDefs = `#graphql
  type AuditLog {
    auditLogId: ID!
    userId: ID
    username: String
    role: String
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
