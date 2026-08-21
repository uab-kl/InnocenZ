import { Request, Response, NextFunction } from 'express';
import {
  agencyMemberRepository,
  agencyOutletRepository,
  authRepository,
  outletMemberRepository,
} from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { requirePermission } from '@/middlewares/require-permission.js';
import { portalRoleName } from '@/types/rbac-constant.js';
import { laneFromRoleHints } from '@/features/rbac/portal-role-map.js';
import { paramId } from '@/util/params.js';

/**
 * Org ACL: portal lane from user_role → role; membership for tenancy only.
 */

export type AgencySubRole = 'owner' | 'finance' | 'director' | 'guarantor';
export type OutletSubRole =
  | 'owner'
  | 'finance'
  | 'operations_head'
  | 'director'
  | 'guarantor';

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
  const hasAgencyPortal =
    roles.some((r) => r.portalCode === 'agency') ||
    roles.some(
      (r) =>
        r.roleName === portalRoleName.AGENCY ||
        r.roleName === 'agency_owner' ||
        r.roleName === 'agency_finance',
    );
  if (!hasAgencyPortal) return false;
  const memberships = await agencyMemberRepository.listByUser(userId);
  if (!memberships.some((m) => m.status === 'active')) return false;
  const lane = laneFromRoleHints(
    'agency',
    roles.map((r) => ({ portalCode: r.portalCode, roleName: r.roleName })),
  );
  /**
   * The lane, used as it is. NOTHING folds here any more.
   *
   * This used to read `lane === 'owner' ? 'owner' : 'finance'`, which was
   * harmless while an agency had exactly two lanes and became an escalation the
   * moment it had four: a view-only Director would have been handed the FINANCE
   * lane, and agency finance raises and signs payment vouchers
   * (`payment_voucher` CRU). The role defined to change nothing would have been
   * able to pay PRs.
   *
   * `laneFromRoleHints('agency', …)` is typed to the lanes an agency issues, so
   * there is no outlet lane left to fold — the compiler now rejects the attempt.
   */
  if (allowed.includes(lane)) return true;
  /**
   * A guarantor passes wherever an owner passes — resolved here, once, exactly
   * as on the outlet side. Adding 'guarantor' to each `requireAgencySubRole(
   * 'owner', …)` call site instead would fail closed on the one that got
   * missed, refusing the stand-in at the only moment the role exists for.
   */
  return lane === 'guarantor' && allowed.includes('owner');
}

async function holdsOutletLane(
  userId: string,
  allowed: readonly OutletSubRole[],
): Promise<boolean> {
  const roles = await authRepository.getRolesForUserIds([userId]);
  const hasOutletPortal =
    roles.some((r) => r.portalCode === 'outlet') ||
    roles.some(
      (r) =>
        r.roleName === portalRoleName.OUTLET ||
        r.roleName === 'outlet_owner' ||
        r.roleName === 'outlet_finance' ||
        r.roleName === 'outlet_ops',
    );
  if (!hasOutletPortal) return false;
  const memberships = await outletMemberRepository.listByUser(userId);
  if (!memberships.some((m) => m.status === 'active')) return false;
  const lane = laneFromRoleHints(
    'outlet',
    roles.map((r) => ({ portalCode: r.portalCode, roleName: r.roleName })),
  );
  if (allowed.includes(lane)) return true;
  /**
   * A guarantor passes anywhere an owner passes.
   *
   * Resolved HERE, once, rather than by adding 'guarantor' to every
   * `requireOutletSubRole('owner', …)` in the route files. Those call sites are
   * spread across the outlet routes, and the one that gets missed fails closed —
   * the stand-in is refused at the moment the owner is unavailable, which is the
   * only moment this role exists for. A guarantor IS an owner for access
   * purposes; keeping the lane distinct is for labelling and audit, not power.
   */
  return lane === 'guarantor' && allowed.includes('owner');
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

/**
 * Confine a caller to the ONE venue named in the path.
 *
 * The lane guards above answer "does this person hold an owner/ops lane
 * SOMEWHERE". That is not a scope check, and on `outlet-workspace` the
 * difference was the whole bug: `outletOwnerOrOpsIfMember` let the owner of one
 * venue rewrite ANOTHER venue's pay rates and drink prices, because nothing in
 * the chain ever compared the caller against `:outletId`. The controller reads
 * the id straight from the path and never consults `req.user`, so the router is
 * the only place it can be stopped. Worse, that guard returns `next()` outright
 * for a caller with no outlet membership — which is every agency account — so
 * an agency could rewrite the rate card of a venue it has no relationship with.
 *
 * Each org is scoped by the rule that org already uses elsewhere:
 *   - an OUTLET operator must hold an active membership of THIS venue;
 *   - an AGENCY operator must hold an APPROVED `agency_outlet` link to it.
 *     `listApprovedOutletIdsForAgency` is the repository's own stated "portal
 *     visibility rule", and reusing it keeps one answer to "which venues may
 *     this agency see". Agencies deliberately keep BOTH verbs here — they
 *     configure rates on a venue's behalf, and the last attempt to restrict
 *     this to outlet-only broke that flow.
 *
 * Compose this with a lane guard, do not replace one: this says WHICH venue,
 * the lane guard says WHO within it.
 */
export function requireOutletScopeByParam(param: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      if (await isAdmin(user.id)) return next();

      const raw = req.params[param];
      const outletId = raw == null ? '' : paramId(raw);
      if (!outletId) {
        return res
          .status(400)
          .json({ success: false, message: 'Missing outlet id', data: null });
      }

      // Outlet side first: someone who operates venues is judged as a venue
      // operator, never allowed to fall through to the agency branch below.
      const outletMemberships = await outletMemberRepository.listByUser(user.id);
      const activeOutlets = outletMemberships.filter((m) => m.status === 'active');
      if (activeOutlets.length > 0) {
        if (!activeOutlets.some((m) => m.outletId === outletId)) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden — not a member of this outlet',
            data: null,
          });
        }
        return next();
      }

      const agencyMemberships = await agencyMemberRepository.listByUser(user.id);
      const activeAgency = agencyMemberships.find((m) => m.status === 'active');
      if (activeAgency?.agencyId) {
        const linked = await agencyOutletRepository.listApprovedOutletIdsForAgency(
          activeAgency.agencyId,
        );
        if (!linked.includes(outletId)) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden — your agency is not linked to this outlet',
            data: null,
          });
        }
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Forbidden — not a member of this outlet',
        data: null,
      });
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
