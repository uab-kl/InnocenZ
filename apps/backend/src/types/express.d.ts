import type { UserType } from '@/features/user/user.model';

declare global {
  namespace Express {
    interface Request {
      user?: UserType;
      auditLogged?: boolean;
      auditOldData?: unknown;
      /**
       * Set by `redactIdentityDocsForOutlet` when the caller reaches a
       * user-shaped response as an OUTLET and nothing more. Read at the response
       * boundary in `withUserProfile`; never a gate on its own.
       */
      redactIdentityDocs?: boolean;
    }
  }
}

export {};
