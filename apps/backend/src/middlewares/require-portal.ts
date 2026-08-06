import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import type { PortalCodeValue } from '@/types/rbac-constant.js';
import { portalRoleName } from '@/types/rbac-constant.js';

/**
 * Portal gate: user must hold ≥1 active role whose portal.code matches.
 * Replaces name-only `requireRole('admin'|'agency'|'outlet')` for portal entry
 * while still accepting legacy role names via portal_id backfill.
 *
 * Admin callers always pass when checking agency/outlet? No — admin has admin
 * portal only. Cross-portal admin access uses requireRole('admin') on shared
 * routes, or requirePortalOrAdmin below.
 */
export function requirePortal(...allowed: PortalCodeValue[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      const portals = new Set(roles.map((r) => r.portalCode).filter(Boolean));
      const permitted = allowed.some((code) => portals.has(code));

      if (!permitted) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden — requires portal: ' + allowed.join(', '),
          data: null,
        });
      }

      next();
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}

/** Portal match OR platform admin (admin may act across org APIs). */
export function requirePortalOrAdmin(...allowed: PortalCodeValue[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      if (roles.some((r) => r.roleName === portalRoleName.ADMIN)) return next();

      const portals = new Set(roles.map((r) => r.portalCode).filter(Boolean));
      if (allowed.some((code) => portals.has(code))) return next();

      return res.status(403).json({
        success: false,
        message: 'Forbidden — requires portal: ' + allowed.join(', '),
        data: null,
      });
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}

export const requireAdminPortal = requirePortal('admin');
