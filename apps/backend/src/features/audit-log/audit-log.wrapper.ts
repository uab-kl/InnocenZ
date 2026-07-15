import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { GraphQLContext } from '@/graphql/context';
import { CreateAuditLogInput, registerAuditOldDataFetcher } from './audit-log.repository';
import {
  auditLogRepository,
  authRepository,
  moduleRepository,
  permissionRepository,
  rolePermissionRepository,
  roleRepository,
  userRepository,
  userRoleRepository,
} from '@/composition-root';
import { logger } from '@/util/logger';
import { db } from '@/db/index';
import { paramId } from '@/util/params';
export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_CREATE'
  | 'BULK_UPDATE'
  | 'BULK_DELETE';

export interface WithAuditOptions<TArgs, TResult> {
  entity: string;
  action: AuditActionType;
  getEntityId?: (result: TResult | null, args: TArgs) => string | string[] | null;
  getOldData?: (args: TArgs, context: GraphQLContext) => Promise<unknown> | unknown;
  getNewData?: (result: TResult | null, args: TArgs) => unknown;
}

export type ResolverFn<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: unknown,
) => Promise<TResult>;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'currentPassword',
  'newPassword',
]);

const ENTITY_MAP: Record<string, string> = {
  role: 'Role',
  module: 'Module',
  permission: 'Permission',
  user: 'User',
  'user-role': 'UserRole',
  'role-permission': 'RolePermission',
  auth: 'Auth',
};

function getRestIpAddress(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return forwardedStr.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getGraphqlIpAddress(context: GraphQLContext): string {
  const req = context.req;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return forwardedStr.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getRestUserAgent(req: Request): string {
  return req.headers['user-agent'] || 'unknown';
}

function getGraphqlUserAgent(context: GraphQLContext): string {
  return context.req.headers['user-agent'] || 'unknown';
}

export function getGraphqlAuditRole(context: GraphQLContext): string | null {
  if (context.userRoles.length === 0) {
    return null;
  }

  const adminRole = context.userRoles.find((role) => role.roleName === 'admin');
  if (adminRole) {
    return adminRole.roleName;
  }

  return context.userRoles[0]?.roleName ?? null;
}

export function withAudit<TParent, TArgs, TResult>(
  options: WithAuditOptions<TArgs, TResult>,
  resolver: ResolverFn<TParent, TArgs, TResult>,
): ResolverFn<TParent, TArgs, TResult> {
  const { entity, action, getEntityId, getOldData, getNewData } = options;
  const isBulkAction = action === 'BULK_CREATE' || action === 'BULK_UPDATE' || action === 'BULK_DELETE';
  const isCreateAction = action === 'CREATE' || action === 'BULK_CREATE';
  const isDeleteAction = action === 'DELETE' || action === 'BULK_DELETE';

  return async (parent, args, context, info) => {
    const batchId = isBulkAction ? randomUUID() : null;
    let oldData: unknown = null;
    let result: TResult | null = null;

    return db.transaction(async (tx) => {
      try {
        const contextWithTx: GraphQLContext = { ...context, tx };

        if (
          getOldData &&
          (action === 'UPDATE' ||
            action === 'DELETE' ||
            action === 'BULK_UPDATE' ||
            action === 'BULK_DELETE')
        ) {
          try {
            oldData = await getOldData(args, contextWithTx);
          } catch (error) {
            logger.warn('[withAudit] Failed to fetch old data:', error);
          }
        }

        result = await resolver(parent, args, contextWithTx, info);
        context.auditLogged = true;

        const entityIdValue = getEntityId ? getEntityId(result, args) : null;
        const newDataValue = getNewData ? getNewData(result, args) : result;

        if (isBulkAction && Array.isArray(entityIdValue)) {
          const oldArray = Array.isArray(oldData) ? oldData : entityIdValue.map(() => oldData);
          const newArray = Array.isArray(newDataValue)
            ? newDataValue
            : entityIdValue.map(() => newDataValue);

          await Promise.all(
            entityIdValue.map((id, index) =>
              auditLogRepository.createAuditLog(
                {
                  userId: context.user?.id ?? null,
                  role: getGraphqlAuditRole(context),
                  action,
                  entity,
                  entityId: id,
                  batchId,
                  oldData: !isCreateAction ? oldArray[index] : undefined,
                  newData: !isDeleteAction ? newArray[index] : undefined,
                  ipAddress: getGraphqlIpAddress(context),
                  userAgent: getGraphqlUserAgent(context),
                },
                tx,
              ),
            ),
          );
        } else {
          const entityId = Array.isArray(entityIdValue) ? (entityIdValue[0] ?? null) : entityIdValue;
          const newData = Array.isArray(newDataValue) ? newDataValue[0] : newDataValue;

          await auditLogRepository.createAuditLog(
            {
              userId: context.user?.id ?? null,
              role: getGraphqlAuditRole(context),
              action,
              entity,
              entityId,
              batchId,
              oldData: !isCreateAction ? oldData : undefined,
              newData: !isDeleteAction ? newData : undefined,
              ipAddress: getGraphqlIpAddress(context),
              userAgent: getGraphqlUserAgent(context),
            },
            tx,
          );
        }

        return result;
      } catch (error) {
        try {
          const entityIdValue = getEntityId ? getEntityId(result, args) : null;
          const entityId = Array.isArray(entityIdValue) ? entityIdValue.join(',') : entityIdValue;

          await auditLogRepository.createAuditLog(
            {
              userId: context.user?.id ?? null,
              role: getGraphqlAuditRole(context),
              action: `${action}_FAILED`,
              entity,
              entityId,
              batchId,
              oldData: action !== 'CREATE' ? oldData : undefined,
              newData: { args, error: error instanceof Error ? error.message : String(error) },
              ipAddress: getGraphqlIpAddress(context),
              userAgent: getGraphqlUserAgent(context),
            },
            tx,
          );
        } catch (logError) {
          logger.error('[withAudit] Failed to create audit log for failed mutation:', logError);
        }

        throw error;
      }
    });
  };
}

export function createEntityAudit(entity: string) {
  return function <TParent, TArgs, TResult>(
    options: Omit<WithAuditOptions<TArgs, TResult>, 'entity'>,
    resolver: ResolverFn<TParent, TArgs, TResult>,
  ): ResolverFn<TParent, TArgs, TResult> {
    return withAudit({ ...options, entity }, resolver);
  };
}

export function registerAllAuditOldDataFetchers(): void {
  registerAuditOldDataFetcher('Role', async (req) => {
    const id = req.params.id;
    if (!id) return null;
    return roleRepository.getRoleById(paramId(id));
  });

  registerAuditOldDataFetcher('Module', async (req) => {
    const id = req.params.id;
    if (!id) return null;
    return moduleRepository.getModuleById(paramId(id));
  });

  registerAuditOldDataFetcher('Permission', async (req) => {
    const id = req.params.id;
    if (!id) return null;
    return permissionRepository.getPermissionById(paramId(id));
  });

  registerAuditOldDataFetcher('User', async (req) => {
    const id = req.params.id;
    if (!id) return null;
    return userRepository.getUserById(paramId(id));
  });

  registerAuditOldDataFetcher('UserRole', async (req) => {
    const body = req.body as { userId?: string; previousRoleId?: string; roleId?: string };
    if (!body.userId) return null;

    return {
      userId: body.userId,
      previousRoleId: body.previousRoleId ?? body.roleId ?? null,
    };
  });

  registerAuditOldDataFetcher('RolePermission', async (req) => {
    const roleId = req.params.roleId ?? req.query.roleId;
    if (!roleId) return null;
    return rolePermissionRepository.getRolePermissions(paramId(roleId as string));
  });
}

async function getUserRoleNameById(userId: string): Promise<string | null> {
  const roles = await userRoleRepository.getUserRoles(userId);
  if (roles.length === 0) {
    return null;
  }

  const adminRole = roles.find((role) => role.roleName === 'admin');
  return adminRole?.roleName ?? roles[0]?.roleName ?? null;
}

export async function resolveAuditActor(
  req: Request,
  roleOverride?: string | null,
): Promise<{ userId: string | null; role: string | null }> {
  if (req.user?.id) {
    return {
      userId: req.user.id,
      role: roleOverride !== undefined ? roleOverride : await getUserRoleNameById(req.user.id),
    };
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader?.split(' ')[1];
  if (!token) {
    return { userId: null, role: null };
  }

  try {
    const user = await authRepository.getUserDataByToken(token);
    if (!user || user.status.toLowerCase() !== 'active') {
      return { userId: null, role: null };
    }

    req.user = user;
    return {
      userId: user.id,
      role: roleOverride !== undefined ? roleOverride : await getUserRoleNameById(user.id),
    };
  } catch {
    return { userId: null, role: null };
  }
}

export function redactSensitive<T>(value: T): T {
  if (value === null || value === undefined) {
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

export function resolveEntityFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const v1Index = segments.indexOf('v1');

  if (v1Index >= 0) {
    if (segments[v1Index + 1] === 'rbac' && segments[v1Index + 2]) {
      return ENTITY_MAP[segments[v1Index + 2]] ?? segments[v1Index + 2];
    }

    if (segments[v1Index + 1]) {
      return ENTITY_MAP[segments[v1Index + 1]] ?? segments[v1Index + 1];
    }
  }

  return segments[segments.length - 2] ?? 'unknown';
}

export function resolveRestAction(method: string, path: string): string {
  if (path.includes('/sync')) {
    return 'UPDATE';
  }

  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'READ';
  }
}

function resolveEntityIdFromRequest(req: Request): string | null {
  const paramIdValue =
    req.params.id ??
    req.params.roleId ??
    req.params.userId ??
    req.params.moduleId ??
    req.params.permissionId;

  if (paramIdValue) {
    return paramId(paramIdValue);
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body) {
    return null;
  }

  const bodyId = body.id ?? body.userId ?? body.roleId ?? body.permissionId ?? body.moduleId;
  return typeof bodyId === 'string' ? bodyId : null;
}

function extractNewData(responseBody: unknown): unknown {
  if (!responseBody || typeof responseBody !== 'object') {
    return responseBody;
  }

  const body = responseBody as Record<string, unknown>;
  return body.data ?? responseBody;
}

async function writeAuditLog(
  req: Request,
  input: Omit<CreateAuditLogInput, 'ipAddress' | 'userAgent' | 'role' | 'userId'> & {
    role?: string | null;
    userId?: string | null;
  },
  roleOverride?: string | null,
) {
  const actor = await resolveAuditActor(req, roleOverride ?? input.role);
  await auditLogRepository.createAuditLog({
    ...input,
    userId: input.userId ?? actor.userId,
    role: input.role ?? actor.role,
    ipAddress: getRestIpAddress(req),
    userAgent: getRestUserAgent(req),
  });
}

export async function logRestMutation(
  req: Request,
  statusCode: number,
  requestBody: unknown,
  responseBody: unknown,
): Promise<void> {
  const path = req.originalUrl.split('?')[0];
  const entity = resolveEntityFromPath(path);
  const baseAction = resolveRestAction(req.method, path);
  const action = statusCode >= 400 ? `${baseAction}_FAILED` : baseAction;
  const entityId = resolveEntityIdFromRequest(req);
  const oldData = req.auditOldData;
  const newData =
    statusCode >= 400
      ? { requestBody, responseBody, statusCode }
      : extractNewData(responseBody);

  await writeAuditLog(req, {
    action,
    entity,
    entityId,
    oldData: baseAction === 'CREATE' ? undefined : oldData,
    newData: baseAction === 'DELETE' && statusCode < 400 ? undefined : newData,
  });

  req.auditLogged = true;
}

function resolveGraphqlAction(fieldName: string, errorMessage?: string): string {
  const lower = fieldName.toLowerCase();
  let action = 'UPDATE';

  if (lower.startsWith('create') || lower === 'register' || lower === 'login') {
    action = 'CREATE';
  } else if (lower.startsWith('delete') || lower.startsWith('remove')) {
    action = 'DELETE';
  } else if (lower.startsWith('update') || lower.startsWith('sync')) {
    action = 'UPDATE';
  }

  return errorMessage ? `${action}_FAILED` : action;
}

export async function logGraphQLMutation(
  req: Request,
  fieldName: string,
  variables?: Record<string, unknown>,
  result?: unknown,
  errorMessage?: string,
  roleOverride?: string | null,
): Promise<void> {
  const action = resolveGraphqlAction(fieldName, errorMessage);

  await writeAuditLog(
    req,
    {
      action,
      entity: fieldName,
      entityId: null,
      oldData: variables,
      newData: errorMessage ? { result, error: errorMessage } : result,
    },
    roleOverride,
  );

  req.auditLogged = true;
}