import { Request, Response, NextFunction } from 'express';
import {
  agencyMemberRepository,
  authRepository,
  outletMemberRepository,
} from '@/composition-root.js';
import { Error } from '@/error/index.js';
import type { PermissionTypeCode } from '@/types/rbac-constant.js';
import { portalRoleName } from '@/types/rbac-constant.js';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map.js';
import {
  type OrgScopeDeps,
  pickedOrgId,
  resolveActingOrgId,
} from '@/util/org-scope.js';

const orgScopeDeps: OrgScopeDeps = {
  authRepository,
  agencyMemberRepository,
  outletMemberRepository,
};

/**
 * Module C/R/U gate — resolved from the caller's JOB TITLE AT THE
 * ORGANISATION THEY ARE ACTING IN, not from the union of their global roles.
 *
 * Why this file matters more than it looks: three of the most-used exports of
 * `require-sub-role.ts` (`agencyOwnerOrFinance`, `outletOwnerOrOps`,
 * `outletOwnerOnly`) are aliases for this middleware, not lane guards. They
 * gate the whole payment-voucher and payout-batch surface — 26 routes — so
 * making the lane guards organisation-aware did nothing for any of them.
 * `role_permission` hangs off `role`, and `role` has no organisation.
 *
 * The module names its own portal, so no call site has to be touched: the
 * middleware asks the module which portal it belongs to, resolves which
 * organisation of that kind the caller is acting in, reads the title on that
 * membership, and asks what THAT role is granted.
 *
 * ⚠️ IT NARROWS ONLY WHERE IT SAFELY CAN. If the caller holds no membership
 * of the module's portal at all, the old user-wide check runs unchanged. That
 * is not laziness: the grant table has deliberate cross-portal rows — the
 * mobile PR role has NO portal and reads dashboard, rating, roster and
 * payment_voucher across all three — and narrowing those to a membership they
 * do not have would lock every PR out. Same shape as
 * `requireOutletSubRoleIfMember`, and for the same reason.
 */
export function requirePermission(
  moduleKey: string,
  permissionType: PermissionTypeCode,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    const refuse = () =>
      res.status(403).json({
        success: false,
        message: `Forbidden — requires ${permissionType} on module ${moduleKey}`,
        data: null,
      });

    try {
      const roles = await authRepository.getRolesForUserIds([user.id]);
      if (roles.some((r) => r.roleName === portalRoleName.ADMIN)) return next();

      /**
       * WHICH PORTAL — decided by the organisation the caller is ACTING IN,
       * not by whichever module row the query planner returned first.
       *
       * ⚠️ `settings`, `dashboard` and `history` each exist as a separate
       * module row per portal, and this used to call `modulePortalCode`, which
       * was `limit(1)` with no ORDER BY. The portal it happened to return then
       * decided WHICH ORGANISATION the guard asked about — so an outlet
       * operator's request could be judged against their agency membership, or
       * the reverse. On a key held by one portal only (every other module) the
       * answer is unchanged.
       */
      const modulePortals = await authRepository.modulePortalCodes(moduleKey);
      const orgPortals = modulePortals.filter(
        (c): c is 'agency' | 'outlet' => c === 'agency' || c === 'outlet',
      );
      let portalCode: string | null = modulePortals[0] ?? null;
      if (orgPortals.length === 1) {
        portalCode = orgPortals[0];
      } else if (orgPortals.length > 1) {
        /*
         * Shared key. The portals send `x-org-id` on every request, so ask
         * which of these the named organisation actually belongs to; fall back
         * to the only portal the caller holds an active membership on, and
         * refuse to guess when both are live and nothing was named.
         */
        const named = pickedOrgId(req);
        const [agencies, outlets] = await Promise.all([
          agencyMemberRepository.listByUser(user.id),
          outletMemberRepository.listByUser(user.id),
        ]);
        const activeAgency = agencies.filter((m) => m.status === 'active');
        const activeOutlet = outlets.filter((m) => m.status === 'active');
        if (named && activeAgency.some((m) => m.agencyId === named)) {
          portalCode = 'agency';
        } else if (named && activeOutlet.some((m) => m.outletId === named)) {
          portalCode = 'outlet';
        } else if (activeAgency.length > 0 && activeOutlet.length === 0) {
          portalCode = 'agency';
        } else if (activeOutlet.length > 0 && activeAgency.length === 0) {
          portalCode = 'outlet';
        } else if (activeAgency.length > 0 && activeOutlet.length > 0) {
          return res.status(400).json({
            success: false,
            message:
              'Which organisation? Send x-org-id, or name it in the request.',
            data: null,
          });
        } else {
          portalCode = null;
        }
      }
      if (portalCode === 'agency' || portalCode === 'outlet') {
        const memberships =
          portalCode === 'agency'
            ? await agencyMemberRepository.listByUser(user.id)
            : await outletMemberRepository.listByUser(user.id);
        const active = memberships.filter((m) => m.status === 'active');

        if (active.length > 0) {
          const orgId = await resolveActingOrgId(
            req,
            orgScopeDeps,
            portalCode,
          );
          if (!orgId) {
            return res.status(400).json({
              success: false,
              message:
                'Which organisation? Send x-org-id, or name it in the request.',
              data: null,
            });
          }
          const here = active.find(
            (m) =>
              ('agencyId' in m ? m.agencyId : m.outletId) === orgId,
          );
          if (!here) return refuse();

          const roleName = portalRoleNameForSubRole(portalCode, here.subRole);
          const ok = await authRepository.roleHasPermission(
            roleName,
            portalCode,
            moduleKey,
            permissionType,
          );
          return ok ? next() : refuse();
        }
      }

      // No membership of this module's portal (a PR, a cross-portal grant, or
      // a module with no portal at all) — unchanged behaviour.
      const ok = await authRepository.userHasPermission(
        user.id,
        moduleKey,
        permissionType,
      );
      return ok ? next() : refuse();
    } catch {
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  };
}
