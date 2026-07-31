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

/**
 * Refuses anyone who is not an ACTIVE admin.
 *
 * The hole this closes was confirmed live: a PR's token read 865 audit rows.
 * `@auth` in the typeDefs only requires *a* login, and the repository merely
 * hides `role='admin'` rows — so every other role's activity, with usernames, IP
 * addresses and old/new values, was readable by any signed-in account.
 *
 * ⚠️ It deliberately does NOT use `context.isAdmin`, and that is why this is a
 * function rather than a one-line check. `createContext` sets `isAdmin` from the
 * role NAME alone, so a role that has been switched OFF platform-wide still
 * passes it — and that same roleName-only test is relied on by auth, org-scope,
 * payment-voucher and pr. Tightening it centrally would change four features'
 * behaviour at once, so the stricter rule is kept local to the audit log, the
 * surface that warrants it.
 *
 * Be precise about which `status` this is, because the name invites the wrong
 * reading: `getUserRoles` projects `RoleTable.status`, the status of the ROLE
 * DEFINITION, not of this user's grant — `user_role` has no status column at all,
 * and revoking a role DELETES the row, so a revoked admin is already excluded by
 * the name test. Verified live before shipping, since a wrong guess here locks
 * out every admin: `admin` is `active`, and the `Test` role is `inactive`, so the
 * column is genuinely in use rather than vestigial.
 *
 * ⚠️ Throwing here surfaces as a GraphQL error, and the web client's
 * `graphql-request` wrapper throws on ANY error — which is why the callers were
 * checked first. All three consumers (the admin dashboard's activity feed and
 * both audit-log pages) sit inside the admin-guarded `/admin` tree, so no
 * legitimate caller can reach this and be refused.
 */
function requireActiveAdmin(context: GraphQLContext): void {
  const isActiveAdmin = context.userRoles.some(
    (role) => role.roleName === 'admin' && role.status === 'active',
  );
  if (!isActiveAdmin) {
    throw new Error('Forbidden: the audit log is admin-only');
  }
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
      requireActiveAdmin(context);
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
    // The two filter-vocabulary queries are gated as well. They return no rows,
    // but the distinct action and entity lists are a map of what the platform
    // does and who it does it to — and leaving them open would keep the finding
    // half-closed while looking finished.
    auditLogActions: async (_: unknown, __: unknown, context: GraphQLContext) => {
      requireActiveAdmin(context);
      return auditLogRepository.getDistinctActions(context);
    },
    auditLogEntities: async (_: unknown, __: unknown, context: GraphQLContext) => {
      requireActiveAdmin(context);
      return auditLogRepository.getDistinctEntities(context);
    },
  },
};
