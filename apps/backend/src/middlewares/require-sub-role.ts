import { Request, Response, NextFunction } from 'express';
import {
  agencyMemberRepository,
  authRepository,
  outletMemberRepository,
} from '@/composition-root.js';
import { Error } from '@/error/index.js';

/**
 * Sub-role guards for the agency and outlet portals.
 *
 * Until now Owner / Finance / Ops existed ONLY as if-checks inside the two web
 * portals (agency-rbac.ts `agencyCan()` and outlet-rbac.ts `outletCan()`), which
 * hide buttons. The columns behind them — agency_user.sub_role and
 * outlet_user.sub_role — have been live and populated all along; nothing on the
 * server ever read them, so the API happily accepted a call a hidden button
 * would have prevented. These guards close that gap.
 *
 * Three rules this file holds:
 *  1. `requireRole` stays in front. This is a SECOND, narrower gate — it decides
 *     which member of an already-authorised org may act, never whether the org
 *     itself may. Both guards run: role first, sub-role second.
 *  2. Admin bypasses. The admin grant is "*", and admin accounts have no
 *     agency_user / outlet_user row to check, so requiring one would lock the
 *     platform owner out of routes they are explicitly allowed to use.
 *  3. A caller with several memberships passes if ANY active one carries a
 *     permitted sub-role. Narrowing to the specific org is deliberately NOT done
 *     here — the controllers already scope every query to the caller's own
 *     agency/outlet, and duplicating that here would create a second source of
 *     truth for tenancy.
 */

/** Mirrors the agency_user_sub_role enum. */
export type AgencySubRole = 'owner' | 'finance';
/** Mirrors the outlet_user_sub_role enum. */
export type OutletSubRole = 'owner' | 'finance' | 'operations_head';

const forbidden = (allowed: readonly string[]) =>
  'Forbidden — requires sub-role: ' + allowed.join(' or ');

async function isAdmin(userId: string): Promise<boolean> {
  const roles = await authRepository.getRolesForUserIds([userId]);
  return roles.some((r) => r.roleName === 'admin');
}

function guard(org: 'agency' | 'outlet', allowed: readonly string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      if (await isAdmin(user.id)) return next();

      const memberships =
        org === 'agency'
          ? await agencyMemberRepository.listByUser(user.id)
          : await outletMemberRepository.listByUser(user.id);

      const permitted = memberships.some(
        (m) => m.status === 'active' && allowed.includes(m.subRole),
      );

      if (!permitted) {
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

/** Only these agency sub-roles may proceed (admin always may). */
export function requireAgencySubRole(...allowed: AgencySubRole[]) {
  return guard('agency', allowed);
}

/** Only these outlet sub-roles may proceed (admin always may). */
export function requireOutletSubRole(...allowed: OutletSubRole[]) {
  return guard('outlet', allowed);
}

/**
 * Named grants, kept here so the server matrix sits in ONE place and can be
 * diffed against the two portal files it mirrors. Frontend name → enum value:
 * agency_owner→owner · agency_finance→finance · outlet_owner→owner ·
 * outlet_finance→finance · outlet_ops→operations_head.
 */

/** agencyCan 'assignShifts' · 'managePr' · 'approvePrSignups' · 'editSettings' — owner only. */
export const agencyOwnerOnly = requireAgencySubRole('owner');

/** outletCan 'editSettings' — outlet owner only (finance and ops both excluded). */
export const outletOwnerOnly = requireOutletSubRole('owner');

/** outletCan 'manageWorkspace' · 'postJob' · 'logSales' · 'ratePrs' — owner + ops, never finance. */
export const outletOwnerOrOps = requireOutletSubRole('owner', 'operations_head');
