import { Request, Response, NextFunction } from 'express';
import {
  agencyMemberRepository,
  authRepository,
  outletMemberRepository,
} from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { requirePermission } from '@/middlewares/require-permission.js';
import { portalRoleName } from '@/types/rbac-constant.js';

/**
 * Org ACL: portal role (`agency` / `outlet`) on user_role + membership.sub_role
 * for lane checks. Membership also carries tenancy (which org).
 */

export type AgencySubRole = 'owner' | 'finance';
export type OutletSubRole = 'owner' | 'finance' | 'operations_head';

const forbidden = (allowed: readonly string[]) =>
  'Forbidden — requires role: ' + allowed.join(' or ');

async function isAdmin(userId: string): Promise<boolean> {
  const roles = await authRepository.getRolesForUserIds([userId]);
  return roles.some((r) => r.roleName === portalRoleName.ADMIN);
}

async function holdsAgencyLane(
  userId: string,
  allowed: readonly AgencySubRole[],
): Promise<boolean> {
  const roles = await authRepository.getRolesForUserIds([userId]);
  const names = roles.map((r) => r.roleName);
  // Accept legacy specialized names until remove-specialized-portal-roles runs.
  const hasAgencyPortal =
    names.includes(portalRoleName.AGENCY) ||
    names.some((n) => n === 'agency_owner' || n === 'agency_finance');
  if (!hasAgencyPortal) return false;
  const memberships = await agencyMemberRepository.listByUser(userId);
  return memberships.some(
    (m) => m.status === 'active' && allowed.includes(m.subRole as AgencySubRole),
  );
}

async function holdsOutletLane(
  userId: string,
  allowed: readonly OutletSubRole[],
): Promise<boolean> {
  const roles = await authRepository.getRolesForUserIds([userId]);
  const names = roles.map((r) => r.roleName);
  const hasOutletPortal =
    names.includes(portalRoleName.OUTLET) ||
    names.some(
      (n) =>
        n === 'outlet_owner' || n === 'outlet_finance' || n === 'outlet_ops',
    );
  if (!hasOutletPortal) return false;
  const memberships = await outletMemberRepository.listByUser(userId);
  return memberships.some(
    (m) => m.status === 'active' && allowed.includes(m.subRole as OutletSubRole),
  );
}

function guard(
  org: 'agency' | 'outlet',
  allowed: readonly string[],
  options: { scopeParam?: string } = {},
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      if (await isAdmin(user.id)) return next();

      const ok =
        org === 'agency'
          ? await holdsAgencyLane(user.id, allowed as AgencySubRole[])
          : await holdsOutletLane(user.id, allowed as OutletSubRole[]);

      if (!ok) {
        return res.status(403).json({ success: false, message: forbidden(allowed), data: null });
      }

      if (options.scopeParam) {
        const targetId = req.params[options.scopeParam];
        const memberships =
          org === 'agency'
            ? await agencyMemberRepository.listByUser(user.id)
            : await outletMemberRepository.listByUser(user.id);
        const active = memberships.filter((m) => m.status === 'active');
        const ownsTarget = active.some(
          (m) => ('agencyId' in m ? m.agencyId : m.outletId) === targetId,
        );
        if (!ownsTarget) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden — not a member of this organisation',
            data: null,
          });
        }
      }

      return next();
    } catch {
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}

export function requireAgencySubRole(...allowed: AgencySubRole[]) {
  return guard('agency', allowed);
}

export function requireOutletSubRole(...allowed: OutletSubRole[]) {
  return guard('outlet', allowed);
}

export function requireAgencySubRoleScoped(param: string, ...allowed: AgencySubRole[]) {
  return guard('agency', allowed, { scopeParam: param });
}

export function requireOutletSubRoleScoped(param: string, ...allowed: OutletSubRole[]) {
  return guard('outlet', allowed, { scopeParam: param });
}

export function requireOutletSubRoleIfMember(...allowed: OutletSubRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      if (await isAdmin(user.id)) return next();

      const memberships = await outletMemberRepository.listByUser(user.id);
      const active = memberships.filter((m) => m.status === 'active');
      if (active.length === 0) {
        return next();
      }

      if (!(await holdsOutletLane(user.id, allowed))) {
        return res.status(403).json({ success: false, message: forbidden(allowed), data: null });
      }

      return next();
    } catch {
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}

export const agencyOwnerOnly = requireAgencySubRole('owner');
export const agencyOwnerOfParam = requireAgencySubRoleScoped('id', 'owner');
export const outletOwnerOfParam = requireOutletSubRoleScoped('id', 'owner');

export function refuseOrgStatusChange() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }
    try {
      if (await isAdmin(user.id)) return next();
      if (req.body && typeof req.body === 'object' && 'status' in req.body) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden — status is set by admin approval, not by this endpoint',
          data: null,
        });
      }
      return next();
    } catch {
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  };
}

export const agencyOwnerOrFinance = requirePermission('payment_voucher', 'update');
export const outletOwnerOnly = requirePermission('settings', 'update');
export const outletOwnerOrOps = requirePermission('booking', 'create');
export const outletOwnerOrOpsIfMember = requireOutletSubRoleIfMember('owner', 'operations_head');
