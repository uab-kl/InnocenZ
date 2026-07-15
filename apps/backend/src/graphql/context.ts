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
    context.isAdmin = context.userRoles.some((role) => role.roleName === 'admin');
  } catch {
    // Return unauthenticated context
  }

  return context;
}

export function isAuthenticated(context: GraphQLContext): boolean {
  return context.user !== null;
}
