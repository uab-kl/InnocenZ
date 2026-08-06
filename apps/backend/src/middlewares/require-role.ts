import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { LEGACY_SPECIALIZED_ROLE_NAMES, portalRoleName } from '@/types/rbac-constant.js';

/**
 * Asking for `agency` / `outlet` also accepts leftover specialized role names
 * until remove-specialized-portal-roles.ts has remapped them.
 */
function expandAllowedRoles(allowedRoles: string[]): string[] {
  const set = new Set(allowedRoles);
  if (set.has('agency') || set.has(portalRoleName.AGENCY)) {
    set.add(portalRoleName.AGENCY);
    for (const n of LEGACY_SPECIALIZED_ROLE_NAMES) {
      if (n.startsWith('agency')) set.add(n);
    }
  }
  if (set.has('outlet') || set.has(portalRoleName.OUTLET)) {
    set.add(portalRoleName.OUTLET);
    for (const n of LEGACY_SPECIALIZED_ROLE_NAMES) {
      if (n.startsWith('outlet')) set.add(n);
    }
  }
  return [...set];
}

/**
 * Route guard that allows only users holding one of the given role names.
 * Must run AFTER authenticateJWT (which populates req.user).
 */
export function requireRole(...allowedRoles: string[]) {
  const expanded = expandAllowedRoles(allowedRoles);
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      const roleNames = roles.map((r) => r.roleName);
      const permitted = expanded.some((role) => roleNames.includes(role));

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
