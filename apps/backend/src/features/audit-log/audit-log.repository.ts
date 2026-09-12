import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { GraphQLContext } from '@/graphql/context';
import { DbTransaction } from '@/types/db-transaction';
import { PaginatedResponse, paginateQuery, PaginationParams, PgQueryType } from '@/util/pagination';
import { logger } from '@/util/logger';
import { AuditLogTable } from './audit-log.model';

/**
 * The portals the Audit Log gives a tab of their own. Anything else — and
 * anything null — belongs to "Others".
 */
const KNOWN_AUDIT_PORTALS = ['admin', 'pr', 'outlet', 'agency'];

export type AuditLogFilter = {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  /**
   * The admin Audit Log's tab. `others` is a SENTINEL, not a stored value: it
   * means "no portal, or one the tabs do not name", and must include the NULL
   * rows — `notInArray` alone drops exactly the rows that tab exists for.
   */
  portal?: string;
};

export type AuditLogSort = {
  field?: 'CREATED_AT' | 'ACTION' | 'ENTITY' | 'USER_NAME';
  direction?: 'ASC' | 'DESC';
};

export type CreateAuditLogInput = {
  userId?: string | null;
  role?: string | null;
  /** Which surface — see the column's note in audit-log.model.ts. */
  portal?: string | null;
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
  portal: string | null;
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
        /*
         * ⚠️ A BARE DATE NAMES A WHOLE DAY, NOT ITS FIRST INSTANT.
         *
         * The filter comes from `<input type="date">`, so it is always
         * `YYYY-MM-DD`. `new Date('2026-09-12')` is MIDNIGHT, and `lte` against
         * midnight excluded every row actually written on the 12th — so setting
         * From and To to the same day, which is the obvious way to ask for one
         * day, reliably returned NOTHING.
         *
         * A date-only value is therefore taken as the whole day: strictly less
         * than the following midnight. A value that carries a time is honoured
         * exactly as sent, so an API caller asking for an instant still gets one.
         *
         * ⚠️ Both bounds are UTC, because `new Date('YYYY-MM-DD')` parses as UTC.
         * `dateFrom` has always been read that way, so the two ends stay
         * consistent.
         *
         * ⚠️ AND THAT IS WHY THE ADMIN SCREEN NO LONGER SENDS A BARE DATE.
         *
         * This note used to call a reader-local calendar day "a separate
         * question" — it was the same question, and the screen was getting the
         * wrong answer. `<input type="date">` means the day on the READER'S
         * calendar, so in Malaysia (UTC+8) a UTC day is eight hours out at both
         * ends: "13 Sep" dropped everything before 08:00 local and added the
         * reader's 14th-of-the-month morning instead.
         *
         * Fixed 13 Sep 2026 in the browser, which is the only party that knows
         * the reader's zone: `audit-log-table-view.tsx` now resolves the picked
         * day to local-midnight instants and sends those. This branch stays for
         * API callers who pass a bare date — for them a UTC day is the only
         * defensible reading, since there is no reader to ask.
         */
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(filter.dateTo);
        if (dateOnly) {
          const next = new Date(filter.dateTo);
          next.setUTCDate(next.getUTCDate() + 1);
          whereCondition.push(lt(AuditLogTable.createdAt, next));
        } else {
          whereCondition.push(lte(AuditLogTable.createdAt, new Date(filter.dateTo)));
        }
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
      /**
       * THE TAB — filtered HERE, not after the page has been cut.
       *
       * ⚠️ This used to run in the browser, on the ten rows the server had
       * already paged. So the Admin tab could show ONE row under a footer
       * reading "1–10 of 2752, Page 1 of 276": `query` and `pagination`
       * described different sets. Filtering before the page is taken is what
       * makes the count mean something.
       *
       * `others` is a SENTINEL, never a stored value — it means "no portal, or
       * one the tabs do not name". The NULL branch is load-bearing: every row
       * written before 0164 has a null portal, and `notInArray` alone drops
       * exactly the rows this tab exists to gather.
       */
      if (filter.portal) {
        if (filter.portal === 'others') {
          const unclassified = or(
            isNull(AuditLogTable.portal),
            notInArray(AuditLogTable.portal, KNOWN_AUDIT_PORTALS),
          );
          // `or()` is typed `SQL | undefined`; never push a bare undefined into
          // the condition list — `and(...)` would silently widen the query.
          if (unclassified) whereCondition.push(unclassified);
        } else {
          whereCondition.push(eq(AuditLogTable.portal, filter.portal));
        }
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
          portal: AuditLogTable.portal,
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
        portal: input.portal ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        batchId: input.batchId ?? undefined,
        // Redacted HERE, not at the call sites, because this insert is the one
        // choke point every lane goes through — REST, GraphQL, the withAudit
        // decorator, and their failure branches. Redaction applied per-lane is
        // how the login response's {accessToken, refreshToken} spent months in
        // new_data in PLAINTEXT: req.body was redacted, the response never was,
        // and audit_logs became a table of live 7-day bearer tokens.
        oldData: redactSensitive(input.oldData),
        newData: redactSensitive(input.newData),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })
      .returning();

    return auditLog;
  }
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'currentPassword',
  'newPassword',
  // The MFA enrol response returns the raw TOTP secret and its otpauth URI;
  // either one is enough to mint valid codes forever.
  'secret',
  'otpauthUri',
  'mfaSecret',
  // A successful OTP verify returns a verificationId that the password reset
  // accepts as sole proof — a bearer credential until it is consumed.
  'verificationId',
]);

/**
 * Strip credential-bearing fields before anything is persisted to audit_logs.
 *
 * Dates pass through untouched: old_data is a raw DB row, and rebuilding a Date
 * via Object.entries would flatten created_at/updated_at into `{}` — redaction
 * must never corrupt the audit record it is protecting.
 */
export function redactSensitive<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item)) as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redactSensitive(entry);
  }

  return redacted as T;
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
