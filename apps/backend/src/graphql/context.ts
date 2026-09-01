import { Request } from 'express';
import { authRepository, userRoleRepository } from '@/composition-root';
import type { UserType } from '@/features/user/user.model';
import type { DbTransaction } from '@/types/db-transaction';

export interface UserRoleContext {
  roleName: string;
  status: string;
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
    const user = await authRepository.getUserDataByToken(token);
    if (!user) {
      return context;
    }

    context.user = user;
    req.user = user;

    const roles = await userRoleRepository.getUserRoles(user.id);
    context.userRoles = roles.map((role) => ({
      roleName: role.roleName,
      status: role.status,
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
