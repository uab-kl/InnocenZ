import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import type { PermissionTypeCode } from '@/types/rbac-constant.js';
import { portalRoleName } from '@/types/rbac-constant.js';

/**
 * Module C/R/U gate. Resolves grants from role_permission × m_permission × m_module.
 * Admin role bypasses (full platform access).
 */
export function requirePermission(moduleKey: string, permissionType: PermissionTypeCode) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      if (roles.some((r) => r.roleName === portalRoleName.ADMIN)) return next();

      const ok = await authRepository.userHasPermission(user.id, moduleKey, permissionType);
      if (!ok) {
        return res.status(403).json({
          success: false,
          message: `Forbidden — requires ${permissionType} on module ${moduleKey}`,
          data: null,
        });
      }

      next();
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}
