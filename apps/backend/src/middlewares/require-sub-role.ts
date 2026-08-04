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

      const memberships =
        org === 'agency'
          ? await agencyMemberRepository.listByUser(user.id)
          : await outletMemberRepository.listByUser(user.id);

      const active = memberships.filter(
        (m) => m.status === 'active' && allowed.includes(m.subRole),
      );

      if (active.length === 0) {
        return res.status(403).json({ success: false, message: forbidden(allowed), data: null });
      }

      // Scoped variant: the sub-role must be held IN the organisation being
      // addressed, not in any organisation. Without this the guard answers "are
      // you an owner?" when the route needs "are you THIS one's owner?".
      if (options.scopeParam) {
        const targetId = req.params[options.scopeParam];
        // `in` rather than the `org` flag: the two membership rows are a union,
        // and only a property test narrows it.
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

/** Only these agency sub-roles may proceed (admin always may). */
export function requireAgencySubRole(...allowed: AgencySubRole[]) {
  return guard('agency', allowed);
}

/** Only these outlet sub-roles may proceed (admin always may). */
export function requireOutletSubRole(...allowed: OutletSubRole[]) {
  return guard('outlet', allowed);
}

/**
 * As {@link requireAgencySubRole}, but the sub-role must be held in the agency
 * named by `req.params[param]` — and the caller may not send `status`, which is
 * the admin approve/suspend lane.
 */
export function requireAgencySubRoleScoped(param: string, ...allowed: AgencySubRole[]) {
  return guard('agency', allowed, { scopeParam: param });
}

/** As {@link requireOutletSubRole}, scoped to the outlet in `req.params[param]`. */
export function requireOutletSubRoleScoped(param: string, ...allowed: OutletSubRole[]) {
  return guard('outlet', allowed, { scopeParam: param });
}

/**
 * Refines outlet members only, and waves everyone else through to whatever
 * `requireRole` already decided.
 *
 * Needed on routes an agency and an outlet share, such as logging floor sales:
 * an agency user holds no outlet_user row at all, so the strict guard above
 * would 403 a caller the org-level grant explicitly allows. This variant asks a
 * narrower question — "if you are an outlet member, are you the right kind?" —
 * and leaves who-may-reach-this-route to the role guard in front of it.
 */
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
      if (active.length === 0) return next(); // not an outlet member — not ours to judge

      if (!active.some((m) => allowed.includes(m.subRole))) {
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
 * Named grants, kept here so the server matrix sits in ONE place and can be
 * diffed against the two portal files it mirrors. Frontend name → enum value:
 * agency_owner→owner · agency_finance→finance · outlet_owner→owner ·
 * outlet_finance→finance · outlet_ops→operations_head.
 */

/** agencyCan 'assignShifts' · 'managePr' · 'approvePrSignups' · 'editSettings' — owner only. */
export const agencyOwnerOnly = requireAgencySubRole('owner');

/**
 * Owner OF THE AGENCY IN `:id` — the scoped form, for routes that address one
 * organisation by id.
 *
 * `agencyOwnerOnly` asks only "are you an owner?", which is the right question
 * for a route whose target is derived from the session and the wrong one for
 * `PUT /agency/:id`: every agency owner satisfied it for EVERY agency, so one
 * owner could rewrite another agency's name, SSM number and contact details.
 * The org-level `requireRole('agency')` in front does not help — it is the same
 * gate-without-scoping this project already fixed once on the billing reads,
 * except here it is a write.
 */
export const agencyOwnerOfParam = requireAgencySubRoleScoped('id', 'owner');

/** Owner OF THE OUTLET IN `:id`. Same reasoning as {@link agencyOwnerOfParam} —
 * and it matters more here, because the venue record carries the geo-fence
 * centre that every check-in is measured against. */
export const outletOwnerOfParam = requireOutletSubRoleScoped('id', 'owner');

/**
 * Refuses a non-admin caller who sends `status` on an ORGANISATION record.
 *
 * `agency.status` / `outlet.status` are the admin approve/suspend lane, so an
 * owner sending it could activate their own `pending_review` organisation.
 * REFUSED rather than silently dropped: a save that quietly discards a field is
 * how a caller learns the wrong thing about what persisted.
 *
 * ⚠️ Kept SEPARATE from the scope guard, which is where it started life. Bolted
 * onto the scope guard it travelled to `PUT /:id/members/:memberId`, where
 * `status` means the MEMBER'S status — a field an owner is entitled to set —
 * and refused a legal change while citing admin approval. **The rule was right;
 * its blast radius was not.** One middleware, one job: apply this only to the
 * routes whose `status` really is the admin lane.
 */
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

/**
 * agencyCan 'raisePv' — owner + finance, which today is every agency sub-role.
 *
 * OWNER DECISION (30 Jul 2026) on who may approve or hold a PV day: both. It is
 * stated as a grant rather than left to the org-level `requireRole('agency')`
 * precisely BECAUSE it is currently equivalent — a third agency sub-role would
 * otherwise inherit money-attestation authority by default, silently. Written
 * down, it has to be granted on purpose.
 */
export const agencyOwnerOrFinance = requireAgencySubRole('owner', 'finance');

/** outletCan 'editSettings' — outlet owner only (finance and ops both excluded). */
export const outletOwnerOnly = requireOutletSubRole('owner');

/** outletCan 'manageWorkspace' · 'postJob' · 'ratePrs' — owner + ops, never finance. */
export const outletOwnerOrOps = requireOutletSubRole('owner', 'operations_head');

/** outletCan 'logSales' — owner + ops, on a route agencies also legitimately use. */
export const outletOwnerOrOpsIfMember = requireOutletSubRoleIfMember('owner', 'operations_head');
