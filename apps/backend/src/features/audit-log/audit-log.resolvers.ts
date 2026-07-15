import { auditLogRepository } from '@/composition-root';
import { GraphQLContext } from '@/graphql/context';
import { AuditLogFilter, AuditLogSort } from './audit-log.repository';
import { PaginationParams } from '@/util/pagination';

function transformAuditLog(auditLog: {
  auditLogId: number;
  userId: string | null;
  username: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}) {
  return {
    auditLogId: String(auditLog.auditLogId),
    userId: auditLog.userId,
    username: auditLog.username,
    role: auditLog.role,
    action: auditLog.action,
    entity: auditLog.entity,
    entityId: auditLog.entityId,
    oldData: auditLog.oldData,
    newData: auditLog.newData,
    ipAddress: auditLog.ipAddress,
    userAgent: auditLog.userAgent,
    createdAt: auditLog.createdAt.toISOString(),
  };
}

export const resolvers = {
  Query: {
    auditLogs: async (
      _: unknown,
      args: {
        filter?: AuditLogFilter;
        sort?: AuditLogSort;
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext,
    ) => {
      const paginationParams: PaginationParams = {
        pageSize: args.pageSize ?? 10,
        pageNumber: args.pageNumber ?? 1,
      };
      const result = await auditLogRepository.getAuditLog(
        args.filter ?? {},
        paginationParams,
        context,
        args.sort,
      );

      return {
        query: result.query.map(transformAuditLog),
        pagination: result.pagination,
      };
    },
    auditLogActions: async (_: unknown, __: unknown, context: GraphQLContext) => {
      return auditLogRepository.getDistinctActions(context);
    },
    auditLogEntities: async (_: unknown, __: unknown, context: GraphQLContext) => {
      return auditLogRepository.getDistinctEntities(context);
    },
  },
};
