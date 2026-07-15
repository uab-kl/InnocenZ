import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';

/**
 * Route guard that allows only users holding one of the given role names.
 * Must run AFTER authenticateJWT (which populates req.user).
 * Roles are resolved from the DB so they cannot be spoofed from the token.
 */
export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      const roleNames = roles.map((r) => r.roleName);
      const permitted = allowedRoles.some((role) => roleNames.includes(role));

      if (!permitted) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden — requires one of: ' + allowedRoles.join(', '),
          data: null,
        });
      }

      next();
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}

export const requireAdmin = requireRole('admin');
