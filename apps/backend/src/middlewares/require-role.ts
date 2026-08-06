import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { LEGACY_SPECIALIZED_ROLE_NAMES, portalRoleName } from '@/types/rbac-constant.js';

/**
 * Asking for `agency` / `outlet` accepts any role on that portal (Owner,
 * Finance, Ops Head, …) plus leftover legacy role names until remapped.
 */
function expandAllowedRoles(allowedRoles: string[]): {
  names: string[];
  portals: Set<'agency' | 'outlet'>;
} {
  const names = new Set(allowedRoles);
  const portals = new Set<'agency' | 'outlet'>();

  if (names.has('agency') || names.has(portalRoleName.AGENCY)) {
    names.add(portalRoleName.AGENCY);
    names.add(portalRoleName.OWNER);
    names.add(portalRoleName.FINANCE);
    portals.add('agency');
    for (const n of LEGACY_SPECIALIZED_ROLE_NAMES) {
      if (n.startsWith('agency')) names.add(n);
    }
  }
  if (names.has('outlet') || names.has(portalRoleName.OUTLET)) {
    names.add(portalRoleName.OUTLET);
    names.add(portalRoleName.OWNER);
    names.add(portalRoleName.FINANCE);
    names.add(portalRoleName.OPS_HEAD);
    portals.add('outlet');
    for (const n of LEGACY_SPECIALIZED_ROLE_NAMES) {
      if (n.startsWith('outlet')) names.add(n);
    }
  }
  return { names: [...names], portals };
}

/**
 * Route guard that allows only users holding one of the given role names.
 * Must run AFTER authenticateJWT (which populates req.user).
 *
 * For `agency` / `outlet`, also permits any role whose portal.code matches
 * (lane roles share display names across portals).
 */
export function requireRole(...allowedRoles: string[]) {
  const { names: expanded, portals } = expandAllowedRoles(allowedRoles);
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      const permitted = roles.some((r) => {
        if (expanded.includes(r.roleName)) {
          // Owner/Finance exist on both portals — only count when the request
          // did not ask for a portal, or the role's portal matches.
          if (
            (r.roleName === portalRoleName.OWNER ||
              r.roleName === portalRoleName.FINANCE ||
              r.roleName === portalRoleName.OPS_HEAD) &&
            portals.size > 0
          ) {
            return r.portalCode != null && portals.has(r.portalCode as 'agency' | 'outlet');
          }
          return true;
        }
        return (
          r.portalCode != null &&
          portals.has(r.portalCode as 'agency' | 'outlet')
        );
      });

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
