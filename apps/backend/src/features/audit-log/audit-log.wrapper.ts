import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { GraphQLContext } from '@/graphql/context';
import {
  CreateAuditLogInput,
  redactSensitive,
  registerAuditOldDataFetcher,
} from './audit-log.repository';

export { redactSensitive };
import {
  agencyMemberRepository,
  agencyRepository,
  auditLogRepository,
  authRepository,
  outletMemberRepository,
  outletRepository,
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
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map';
import { type OrgScopeDeps, pickedOrgKind, resolveActingOrgId } from '@/util/org-scope';

const orgScopeDeps: OrgScopeDeps = {
  authRepository,
  agencyMemberRepository,
  outletMemberRepository,
};
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

// SENSITIVE_KEYS and redactSensitive moved to audit-log.repository.ts, where
// createAuditLog applies them to EVERY lane's old/new data at the insert —
// the wrapper only ever redacted req.body, which is how login responses ended
// up storing live tokens. Re-exported below so existing imports keep working.

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

/**
 * WHICH SURFACE a GraphQL mutation came from — the Audit Log's tab.
 *
 * Paired with `getGraphqlAuditRole` below, which answers the actor's CAPACITY.
 * Both are stored, because neither implies the other: `Owner` exists on the
 * agency and the outlet portal alike.
 */
export function getGraphqlAuditPortal(context: GraphQLContext): string | null {
  if (context.userRoles.length === 0) return null;
  const adminRole = context.userRoles.find((role) => role.roleName === 'admin');
  if (adminRole) return adminRole.portalCode ?? 'admin';
  return context.userRoles[0]?.portalCode ?? null;
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
                  portal: getGraphqlAuditPortal(context),
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
              portal: getGraphqlAuditPortal(context),
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
              portal: getGraphqlAuditPortal(context),
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

/**
 * 🔴 THE RESOURCE ID, READ OFF THE PATH — because `req.params` IS EMPTY HERE.
 *
 * Every old-data fetcher below runs inside `platformAuditMiddleware`, and that
 * is mounted with `v1Router.use(...)` — BEFORE any route is matched. Express
 * fills `req.params` when a route matches, so at that moment it is `{}`.
 *
 * Each fetcher read `req.params.id`, got `undefined`, and returned null. That is
 * why `audit_logs.old_data` was NULL for 100% of UPDATE rows on EVERY entity —
 * `User` included, which has had a fetcher all along (266 updates, 0 with old
 * data). The backlog recorded this as an outlet problem; it was the whole table.
 *
 * The asymmetry that hid it: `resolveEntityIdFromRequest`, which fills
 * `audit_logs.entity_id`, reads the same `req.params` and WORKS — because it
 * runs in `res.on('finish')`, long after routing. One request, two readers of
 * the same field, opposite answers, and only one of them wrong.
 *
 * Mirrors `resolveEntityFromPath` exactly, including its `rbac` special case, so
 * the entity and its id are always taken from the same segment of the same path.
 */
export function resolveEntityIdFromPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  const v1Index = segments.indexOf('v1');
  if (v1Index < 0) return null;

  const candidate =
    segments[v1Index + 1] === 'rbac' && segments[v1Index + 2]
      ? segments[v1Index + 3]
      : segments[v1Index + 2];
  if (!candidate) return null;

  // A uuid or a numeric id — never a sub-resource word like `status` or `mine`,
  // which would otherwise be fetched as though it were a primary key.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
  const isNumeric = /^\d+$/.test(candidate);
  return isUuid || isNumeric ? candidate : null;
}

/** `req.params` first, so a fetcher called AFTER routing keeps working. */
function auditResourceId(req: Request): string | null {
  // A wildcard route can type a param as an ARRAY, and `paramId` on one is a
  // silent wrong answer rather than a refusal.
  const fromParams = req.params?.id;
  if (typeof fromParams === 'string' && fromParams) return fromParams;
  return resolveEntityIdFromPath(req.originalUrl.split('?')[0]);
}

export function registerAllAuditOldDataFetchers(): void {
  registerAuditOldDataFetcher('Role', async (req) => {
    const id = auditResourceId(req);
    if (!id) return null;
    return roleRepository.getRoleById(paramId(id));
  });

  registerAuditOldDataFetcher('Module', async (req) => {
    const id = auditResourceId(req);
    if (!id) return null;
    return moduleRepository.getModuleById(paramId(id));
  });

  registerAuditOldDataFetcher('Permission', async (req) => {
    const id = auditResourceId(req);
    if (!id) return null;
    return permissionRepository.getPermissionById(paramId(id));
  });

  registerAuditOldDataFetcher('User', async (req) => {
    const id = auditResourceId(req);
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

  /*
   * THE ORGANISATION ENTITIES — the ones the backlog actually named.
   *
   * `resolveEntityFromPath` returns these LOWER-CASE, straight off the URL
   * segment, because `ENTITY_MAP` only renames the six RBAC paths. The registry
   * key must match what that function returns, so `'outlet'` and not `'Outlet'`
   * — a capitalised key here registers a fetcher nothing will ever look up, and
   * it fails exactly the way the old bug did: silently, as a null.
   *
   * `redactSensitive` runs over whatever these return before it is stored, so an
   * outlet's own row cannot carry anything through that the audit reader is not
   * already allowed to see.
   */
  registerAuditOldDataFetcher('outlet', async (req) => {
    const id = auditResourceId(req);
    if (!id) return null;
    return outletRepository.getById(paramId(id));
  });

  registerAuditOldDataFetcher('agency', async (req) => {
    const id = auditResourceId(req);
    if (!id) return null;
    return agencyRepository.getById(paramId(id));
  });

  registerAuditOldDataFetcher('RolePermission', async (req) => {
    // `req.query` IS populated before routing (express parses it off the URL);
    // only `req.params` is not. The path fallback covers `/rbac/role/:roleId/...`.
    // `?roleId=a&roleId=b` arrives as an ARRAY, and `paramId` on an array is a
    // silent wrong answer rather than a refusal — so only a single string counts.
    const fromQuery = typeof req.query.roleId === 'string' ? req.query.roleId : null;
    const fromParams =
      typeof req.params?.roleId === 'string' ? req.params.roleId : null;
    const roleId = fromParams ?? fromQuery ?? auditResourceId(req);
    if (!roleId) return null;
    return rolePermissionRepository.getRolePermissions(paramId(roleId));
  });
}

/**
 * IN WHAT CAPACITY DID THIS ACTOR ACT — for `audit_log.role`.
 *
 * ⚠️ This used to be `roles[0]?.roleName` after an admin special case. Two
 * things were wrong with it and both matter for a trail: `getUserRoles` has
 * no ORDER BY, so `[0]` was an insertion-order accident, and the answer was
 * global, so it could not say which organisation the write landed on. For a
 * person who is Director at one agency and Finance at another, a permitted
 * write could be recorded as made by a VIEW-ONLY account — which is exactly
 * the kind of claim an audit log exists to settle.
 *
 * Now it asks the membership of the organisation being acted in. `audit_log`
 * still has no organisation column of its own, so this records the capacity,
 * not the venue — but the capacity it records is the true one.
 *
 * The fallback is deliberate and unchanged for everyone it covers: an actor
 * with no agency or venue membership (a PR, a service account) keeps the old
 * answer, because for them there is no membership to be more precise about.
 */
async function getUserRoleNameById(
  userId: string,
  req?: Request,
): Promise<{ role: string | null; portal: string | null }> {
  const roles = await userRoleRepository.getUserRoles(userId);
  if (roles.length === 0) {
    return { role: null, portal: null };
  }

  // Admin is a platform capacity, not an organisational one — tested first,
  // exactly as before, and the audit resolvers filter on this string.
  const adminRole = roles.find((role) => role.roleName === 'admin');
  if (adminRole) return { role: adminRole.roleName, portal: 'admin' };

  if (req) {
    /*
     * ⚠️ ASK WHICH CONSOLE FIRST — probing agency-then-outlet stamps the wrong
     * portal on a real and ordinary case.
     *
     * Somebody who staffs ONE agency and also works at a venue makes a write
     * from the OUTLET console. On the agency pass `resolveActingOrgId` cannot
     * match the venue id, falls back to their single active agency, and
     * answers — so the loop returned `{ role: 'Finance', portal: 'agency' }`
     * and never reached the outlet pass. The row then claims an agency job
     * title for a venue action: not the honest NULL of a pre-0164 row, but a
     * confidently wrong one, which is the mis-attribution 0164 exists to stop.
     *
     * `x-org-kind` already travels with every request and says which table to
     * look in. `resolveOrgScope` was given exactly this treatment on 10 Sep
     * and `orgOwnerPaysOnly` runs this same `kind ? [kind] : [...]` narrowing
     * — this is that pattern, not a new idea. Without the header (an older
     * client) the previous order stands, which is the best guess available.
     */
    const kind = pickedOrgKind(req);
    for (const org of (kind ? [kind] : ['agency', 'outlet']) as Array<
      'agency' | 'outlet'
    >) {
      const memberships =
        org === 'agency'
          ? await agencyMemberRepository.listByUser(userId)
          : await outletMemberRepository.listByUser(userId);
      if (!memberships.some((m) => m.status === 'active')) continue;
      const orgId = await resolveActingOrgId(req, orgScopeDeps, org);
      if (!orgId) continue;
      const here = memberships.find(
        (m) =>
          m.status === 'active' &&
          ('agencyId' in m ? m.agencyId : m.outletId) === orgId,
      );
      /*
       * BOTH facts. The lane says what this person WAS; `org` says WHERE they
       * acted, and it was being thrown away on this very line — which is why
       * every `Owner` row landed in the Audit Log's "Others" tab. It cannot be
       * recovered later: Owner, Finance, Director and Guarantor each exist on
       * both portals, so the name alone never identifies one.
       */
      if (here) {
        return { role: portalRoleNameForSubRole(org, here.subRole), portal: org };
      }
    }
  }

  const fallback = roles[0]?.roleName ?? null;
  return {
    role: fallback,
    // A legacy role row whose NAME is a portal code is the one case a name does
    // identify a surface; anything else stays unclassified rather than guessed.
    portal:
      fallback === 'pr' || fallback === 'agency' || fallback === 'outlet'
        ? fallback
        : null,
  };
}

export async function resolveAuditActor(
  req: Request,
  roleOverride?: string | null,
): Promise<{ userId: string | null; role: string | null; portal: string | null }> {
  if (req.user?.id) {
    /*
     * The portal is resolved even when the ROLE is overridden: an override says
     * what to call the actor, never which surface they acted on, and the Audit
     * Log's tabs group by the surface.
     */
    const resolved = await getUserRoleNameById(req.user.id, req);
    return {
      userId: req.user.id,
      role: roleOverride !== undefined ? roleOverride : resolved.role,
      portal: resolved.portal,
    };
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader?.split(' ')[1];
  if (!token) {
    return { userId: null, role: null, portal: null };
  }

  try {
    const user = await authRepository.getUserDataByToken(token);
    if (!user || user.status.toLowerCase() !== 'active') {
      return { userId: null, role: null, portal: null };
    }

    req.user = user;
    const resolved = await getUserRoleNameById(user.id, req);
    return {
      userId: user.id,
      role: roleOverride !== undefined ? roleOverride : resolved.role,
      portal: resolved.portal,
    };
  } catch {
    return { userId: null, role: null, portal: null };
  }
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
    portal: actor.portal,
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