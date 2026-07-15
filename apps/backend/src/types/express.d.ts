import type { UserType } from '@/features/user/user.model';

declare global {
  namespace Express {
    interface Request {
      user?: UserType;
      auditLogged?: boolean;
      auditOldData?: unknown;
    }
  }
}

export {};
