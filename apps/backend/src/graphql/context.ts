import { Request } from 'express';
import { authRepository, userRoleRepository } from '@/composition-root';
import { resolveApiSessionUser } from '@/features/auth/session-guard';
import type { UserType } from '@/features/user/user.model';
import type { DbTransaction } from '@/types/db-transaction';

export interface UserRoleContext {
  roleName: string;
  status: string;
  /**
   * WHICH SURFACE this role belongs to. Carried so the audit log can record it:
   * `Owner`, `Finance`, `Director` and `Guarantor` each exist on BOTH portals,
   * so the name alone can never say where somebody acted.
   */
  portalCode: string | null;
}

export interface GraphQLContext {
  user: UserType | null;
  userRoles: UserRoleContext[];
  isAdmin: boolean;
  req: Request;
  tx?: DbTransaction;
  auditLogged?: boolean;
}

export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const context: GraphQLContext = {
    user: null,
    userRoles: [],
    isAdmin: false,
    req,
  };

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return context;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return context;
  }

  try {
    /*
     * The SAME session rules as REST's authenticateJWT — refresh token refused,
     * `sessions_valid_from` cutoff, suspended organisation. This used to be
     * `getUserDataByToken`, which checks the signature only, so a session a
     * password change had ended, or a refresh token, still worked here.
     */
    const user = await resolveApiSessionUser(token, { sessions: authRepository });
    if (!user) {
      return context;
    }

    context.user = user;
    req.user = user;

    /*
     * `getRolesForUserIds`, not `getUserRoles` — it returns the PORTAL CODE and
     * it filters out deactivated roles, which the other does not. The audit log
     * needs the first; the deactivated-role rule below has always needed the
     * second.
     */
    const roles = await authRepository.getRolesForUserIds([user.id]);
    context.userRoles = roles.map((role) => ({
      roleName: role.roleName,
      status: 'active',
      portalCode: role.portalCode ?? null,
    }));
    /**
     * AN ADMIN ROLE THAT IS SWITCHED OFF IS NOT AN ADMIN.
     *
     * This test was the role NAME alone, so a deactivated admin kept every
     * privilege the flag grants — and what it grants is the audit log:
     * `audit-log.repository` uses `!context.isAdmin` to hide `role='admin'`
     * rows, so the one account that should have lost visibility kept it.
     *
     * The audit log's resolvers already refused that case with their own
     * `requireActiveAdmin`, written precisely because this line could not be
     * trusted. That guard stays as the belt to this braces, but the flag itself
     * is now correct, so no future consumer inherits the old meaning. The
     * matching gap on the REST side — `getRolesForUserIds`, which every route
     * guard calls — was closed in the same change.
     */
    context.isAdmin = context.userRoles.some(
      (role) => role.roleName === 'admin' && role.status === 'active',
    );
  } catch {
    // Return unauthenticated context
  }

  return context;
}

export function isAuthenticated(context: GraphQLContext): boolean {
  return context.user !== null;
}
