import { and, asc, desc, eq, gte, lte, ne, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { GraphQLContext } from '@/graphql/context';
import { DbTransaction } from '@/types/db-transaction';
import { PaginatedResponse, paginateQuery, PaginationParams, PgQueryType } from '@/util/pagination';
import { logger } from '@/util/logger';
import { AuditLogTable } from './audit-log.model';

export type AuditLogFilter = {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
};

export type AuditLogSort = {
  field?: 'CREATED_AT' | 'ACTION' | 'ENTITY' | 'USER_NAME';
  direction?: 'ASC' | 'DESC';
};

export type CreateAuditLogInput = {
  userId?: string | null;
  role?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  batchId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress: string;
  userAgent: string;
};

export type AuditLogListItem = {
  auditLogId: number;
  userId: string | null;
  username: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  batchId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
};

export class AuditLogRepositoryClass {
  constructor() {}

  async getAuditLog(
    filter: AuditLogFilter,
    paginationParams: PaginationParams,
    context?: GraphQLContext,
    sort?: AuditLogSort,
  ): Promise<PaginatedResponse<AuditLogListItem>> {
    try {
      const whereCondition: SQL[] = [];

      if (filter.dateFrom) {
        whereCondition.push(gte(AuditLogTable.createdAt, new Date(filter.dateFrom)));
      }
      if (filter.dateTo) {
        whereCondition.push(lte(AuditLogTable.createdAt, new Date(filter.dateTo)));
      }
      if (filter.userId) {
        whereCondition.push(eq(AuditLogTable.userId, filter.userId));
      }
      if (filter.entity) {
        whereCondition.push(eq(AuditLogTable.entity, filter.entity));
      }
      if (filter.entityId) {
        whereCondition.push(eq(AuditLogTable.entityId, filter.entityId));
      }
      if (filter.action) {
        whereCondition.push(eq(AuditLogTable.action, filter.action));
      }

      if (context && !context.isAdmin) {
        whereCondition.push(ne(AuditLogTable.role, 'admin'));
      }

      const whereClause = whereCondition.length > 0 ? and(...whereCondition) : undefined;
      const sortField = sort?.field ?? 'CREATED_AT';
      const sortDirection = sort?.direction === 'ASC' ? asc : desc;

      let orderByClause: SQL;
      if (sortField === 'ACTION') {
        orderByClause = sortDirection(AuditLogTable.action);
      } else if (sortField === 'ENTITY') {
        orderByClause = sortDirection(AuditLogTable.entity);
      } else if (sortField === 'USER_NAME') {
        orderByClause = sortDirection(UserTable.username);
      } else {
        orderByClause = desc(AuditLogTable.createdAt);
      }

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(AuditLogTable)
        .leftJoin(UserTable, eq(AuditLogTable.userId, UserTable.id))
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;

      const baseQuery = db
        .select({
          auditLogId: AuditLogTable.auditLogId,
          userId: AuditLogTable.userId,
          role: AuditLogTable.role,
          action: AuditLogTable.action,
          entity: AuditLogTable.entity,
          entityId: AuditLogTable.entityId,
          batchId: AuditLogTable.batchId,
          oldData: AuditLogTable.oldData,
          newData: AuditLogTable.newData,
          ipAddress: AuditLogTable.ipAddress,
          userAgent: AuditLogTable.userAgent,
          createdAt: AuditLogTable.createdAt,
          username: UserTable.username,
        })
        .from(AuditLogTable)
        .leftJoin(UserTable, eq(AuditLogTable.userId, UserTable.id))
        .where(whereClause)
        .orderBy(orderByClause);

      const paginatedQuery = paginateQuery(
        baseQuery as unknown as PgQueryType,
        pageSize,
        pageNumber,
        totalCount,
      );
      const data = (await paginatedQuery.query) as AuditLogListItem[];

      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('[AuditLogRepository.getAuditLog] Error:', error);
      throw error;
    }
  }

  async getDistinctActions(context?: GraphQLContext): Promise<string[]> {
    const whereCondition: SQL[] = [];
    if (context && !context.isAdmin) {
      whereCondition.push(ne(AuditLogTable.role, 'admin'));
    }

    const results = await db
      .select({ action: AuditLogTable.action })
      .from(AuditLogTable)
      .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
      .groupBy(AuditLogTable.action)
      .orderBy(asc(AuditLogTable.action));

    return results.map((row) => row.action).filter((action): action is string => Boolean(action));
  }

  async getDistinctEntities(context?: GraphQLContext): Promise<string[]> {
    const whereCondition: SQL[] = [];
    if (context && !context.isAdmin) {
      whereCondition.push(ne(AuditLogTable.role, 'admin'));
    }

    const results = await db
      .select({ entity: AuditLogTable.entity })
      .from(AuditLogTable)
      .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
      .groupBy(AuditLogTable.entity)
      .orderBy(asc(AuditLogTable.entity));

    return results.map((row) => row.entity).filter((entity): entity is string => Boolean(entity));
  }

  async createAuditLog(
    input: CreateAuditLogInput,
    tx?: DbTransaction,
  ): Promise<typeof AuditLogTable.$inferSelect> {
    const [auditLog] = await (tx ?? db)
      .insert(AuditLogTable)
      .values({
        userId: input.userId ?? undefined,
        role: input.role ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        batchId: input.batchId ?? undefined,
        oldData: input.oldData,
        newData: input.newData,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })
      .returning();

    return auditLog;
  }
}

export type AuditOldDataFetcher = (req: import('express').Request) => Promise<unknown>;

const oldDataFetcherRegistry = new Map<string, AuditOldDataFetcher>();

export function registerAuditOldDataFetcher(entity: string, fetcher: AuditOldDataFetcher): void {
  oldDataFetcherRegistry.set(entity, fetcher);
}

export async function fetchAuditOldData(
  entity: string,
  req: import('express').Request,
): Promise<unknown> {
  if (req.auditOldData !== undefined) {
    return req.auditOldData;
  }

  const fetcher = oldDataFetcherRegistry.get(entity);
  if (!fetcher) {
    return null;
  }

  return fetcher(req);
}
