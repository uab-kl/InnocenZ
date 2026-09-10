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
import { paramId } from '@/util/params.js';
import {
  type OrgScopeDeps,
  pickAgencyId,
  resolveActingOrgId,
} from '@/util/org-scope.js';

/** The three repositories the shared org resolver needs. */
const orgScopeDeps: OrgScopeDeps = {
  authRepository,
  agencyMemberRepository,
  outletMemberRepository,
};

/**
 * ORG ACL — WHICH ORGANISATION FIRST, THEN WHAT TITLE WITHIN IT.
 *
 * This file used to say the opposite: *"portal lane from user_role → role;
 * membership for tenancy only"*. That was the design 0107 introduced and
 * 0160 reversed, and while it held, a title was one global fact — so an
 * OWNER at agency A passed an owner-only guard on agency B, where they were
 * only a Director. `agencyOwnerOfParam` proved membership of `:id` in a
 * SEPARATE step from the title, and two separate half-checks are not a
 * scope check.
 *
 * Now: `user_role` says whether the portal may be opened at all, and the
 * membership row for THE ORGANISATION BEING ACTED ON says the title. The
 * organisation is resolved before the title is judged, so there is one
 * question, asked once.
 */

export type AgencySubRole = 'owner' | 'finance' | 'director' | 'guarantor';
export type OutletSubRole =
  'owner' | 'finance' | 'operations_head' | 'director' | 'guarantor';

const forbidden = (allowed: readonly string[]) =>
  'Forbidden — requires role: ' + allowed.join(' or ');

async function isAdmin(userId: string): Promise<boolean> {
  const roles = await authRepository.getRolesForUserIds([userId]);
  return roles.some((r) => r.roleName === portalRoleName.ADMIN);
}

/**
 * Does this person hold one of `allowed` AT THIS AGENCY?
 *
 * `agencyId` is required and non-nullable on purpose. Typed
 * `string | null` it would let every ambiguous call site quietly keep the
 * old org-blind behaviour, which is the bug — the compiler is doing the
 * work of finding those call sites.
 */
async function holdsAgencyLane(
  userId: string,
  agencyId: string,
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
  /*
   * The membership of THIS agency, and its own title. Not
   * `memberships.some(active)` — that asked whether they staff any agency
   * at all, which an owner of a different one satisfies.
   */
  const memberships = await agencyMemberRepository.listByUser(userId);
  const here = memberships.find(
    (m) => m.status === 'active' && m.agencyId === agencyId,
  );
  if (!here) return false;
  const lane = here.subRole as AgencySubRole;
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
   * The lane now comes straight off this agency's own membership row, so
   * there is no cross-portal value left to fold and nothing to normalise.
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

/** The venue twin — see `holdsAgencyLane` for why `outletId` is required. */
async function holdsOutletLane(
  userId: string,
  outletId: string,
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
  const here = memberships.find(
    (m) => m.status === 'active' && m.outletId === outletId,
  );
  if (!here) return false;
  const lane = here.subRole as OutletSubRole;
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
      return res
        .status(401)
        .json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      // Admin acts on organisations rather than within one — ahead of all
      // org resolution, exactly as before.
      if (await isAdmin(user.id)) return next();

      /*
       * WHICH ORGANISATION — resolved before the title is judged.
       *
       * A scoped guard names it in the path, and that id is used verbatim:
       * `holdsXLane` then answers false when the caller has no active
       * membership there, which is the same refusal the separate ownsTarget
       * check used to make — one query instead of two, and it can no longer
       * pass the title half while failing the org half.
       *
       * Unscoped guards fall to the shared ladder: a verified `x-org-id`,
       * else their single active membership, else 400. Never the oldest.
       */
      let orgId: string | null;
      if (options.scopeParam) {
        const rawParam = req.params[options.scopeParam];
        orgId = rawParam ? paramId(rawParam) : null;
        if (!orgId) {
          return res.status(400).json({
            success: false,
            message: `Missing ${options.scopeParam}`,
            data: null,
          });
        }
      } else {
        orgId = await resolveActingOrgId(req, orgScopeDeps, org);
        if (!orgId) {
          /*
           * The caller staffs several and named none. Answering with a guess
           * is what this whole change exists to stop, so ask instead.
           */
          return res.status(400).json({
            success: false,
            message:
              'Which organisation? Send x-org-id, or name it in the request.',
            data: null,
          });
        }
      }

      const ok =
        org === 'agency'
          ? await holdsAgencyLane(user.id, orgId, allowed as AgencySubRole[])
          : await holdsOutletLane(user.id, orgId, allowed as OutletSubRole[]);

      if (!ok) {
        return res
          .status(403)
          .json({ success: false, message: forbidden(allowed), data: null });
      }

      return next();
    } catch {
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  };
}

export function requireAgencySubRole(...allowed: AgencySubRole[]) {
  return guard('agency', allowed);
}

export function requireOutletSubRole(...allowed: OutletSubRole[]) {
  return guard('outlet', allowed);
}

export function requireAgencySubRoleScoped(
  param: string,
  ...allowed: AgencySubRole[]
) {
  return guard('agency', allowed, { scopeParam: param });
}

export function requireOutletSubRoleScoped(
  param: string,
  ...allowed: OutletSubRole[]
) {
  return guard('outlet', allowed, { scopeParam: param });
}

export function requireOutletSubRoleIfMember(...allowed: OutletSubRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      if (await isAdmin(user.id)) return next();

      /*
       * ⚠️ THE SHORT-CIRCUIT IS THE POINT OF THIS GUARD — do not simplify it
       * into `guard()`.
       *
       * AGENCY callers share these routes (shift-sale, shift-template, the
       * outlet-workspace PUT) and hold NO venue membership at all; passing
       * them through is how they reach it, and their right to be there is
       * established elsewhere — `requireOutletScopeByParam` on the workspace,
       * the controller on the others.
       *
       * So the test stays `no venue membership ANYWHERE`, not `no membership
       * of THIS venue`. Narrowing it to the named venue would 403 every
       * agency caller, which is the regression commit 4c7151c already had to
       * revert once.
       */
      const memberships = await outletMemberRepository.listByUser(user.id);
      const active = memberships.filter((m) => m.status === 'active');
      if (active.length === 0) {
        return next();
      }

      /*
       * A venue operator, so the title is demanded — and now AT A NAMED
       * VENUE. `:outletId` when the route has one (the workspace PUT), else
       * the verified `x-org-id`, else their single venue. A `:id` param is
       * deliberately NOT consulted: on these routes it names a template or a
       * shift, not a venue. Passing it would be harmless, because the
       * resolver verifies every id against a membership before honouring it,
       * but it would be a lie about what the value is.
       */
      const namedOutlet = req.params.outletId
        ? paramId(req.params.outletId)
        : undefined;
      const outletId = await resolveActingOrgId(
        req,
        orgScopeDeps,
        'outlet',
        namedOutlet,
      );
      if (!outletId) {
        return res.status(400).json({
          success: false,
          message:
            'Which venue? Send x-org-id, or name it in the request.',
          data: null,
        });
      }

      if (!(await holdsOutletLane(user.id, outletId, allowed))) {
        return res
          .status(403)
          .json({ success: false, message: forbidden(allowed), data: null });
      }

      return next();
    } catch {
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
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
      return res
        .status(401)
        .json({ success: false, message: Error.UNAUTHORIZED, data: null });
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
      const outletMemberships = await outletMemberRepository.listByUser(
        user.id,
      );
      const activeOutlets = outletMemberships.filter(
        (m) => m.status === 'active',
      );
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

      const agencyMemberships = await agencyMemberRepository.listByUser(
        user.id,
      );
      /*
       * The FIFTH copy of the oldest-membership pick, and the one hiding in
       * the guard file itself — `find(m => m.status === 'active')` takes an
       * arbitrary agency to test the outlet link against. For an agency
       * operator at two agencies that could refuse a venue their OTHER
       * agency is linked to. `pickAgencyId` honours the verified header
       * first and falls back to exactly the previous behaviour otherwise.
       */
      const actingAgencyId = pickAgencyId(req, agencyMemberships);
      if (actingAgencyId) {
        const linked =
          await agencyOutletRepository.listApprovedOutletIdsForAgency(
            actingAgencyId,
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
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  };
}

/**
 * Confine a caller to the ONE organisation named in the path — membership only,
 * no lane.
 *
 * The sibling of `requireOutletScopeByParam`, for READS that do not care which
 * lane you hold, only that the org is yours. `GET /agency/:id/members` and
 * `GET /outlet/:id/members` were gated by `requireRole('admin','agency','outlet')`
 * and NOTHING ELSE: the handlers read `:id` straight from the path and never
 * consult `req.user`, so any agency or outlet token could enumerate a RIVAL
 * organisation's entire staff list — and that payload is PII, carrying
 * `username`, `email` and `phoneNum` per member.
 *
 * The route comments already stated the intended rule — "the agency and outlet
 * profile screens list their own members" — but nothing enforced "their own".
 * Every real caller passes its own org id (the profile screens, the settings
 * Team panel) or is an admin screen, so this only removes the cross-org read
 * that nothing was using and nobody should have.
 *
 * The WRITES on these routers were already scoped, via `agencyOwnerOfParam` /
 * `outletOwnerOfParam`. Only the reads were open.
 */
export function requireOrgMembershipByParam(
  org: 'agency' | 'outlet',
  param: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }

    try {
      if (await isAdmin(user.id)) return next();

      const raw = req.params[param];
      const orgId = raw == null ? '' : paramId(raw);
      if (!orgId) {
        return res.status(400).json({
          success: false,
          message: 'Missing organisation id',
          data: null,
        });
      }

      const memberships =
        org === 'agency'
          ? await agencyMemberRepository.listByUser(user.id)
          : await outletMemberRepository.listByUser(user.id);
      const belongs = memberships
        .filter((m) => m.status === 'active')
        .some((m) => ('agencyId' in m ? m.agencyId : m.outletId) === orgId);

      if (!belongs) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden — not a member of this organisation',
          data: null,
        });
      }
      return next();
    } catch {
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
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
      return res
        .status(401)
        .json({ success: false, message: Error.UNAUTHORIZED, data: null });
    }
    try {
      if (await isAdmin(user.id)) return next();
      if (req.body && typeof req.body === 'object' && 'status' in req.body) {
        return res.status(403).json({
          success: false,
          message:
            'Forbidden — status is set by admin approval, not by this endpoint',
          data: null,
        });
      }
      return next();
    } catch {
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  };
}

export const agencyOwnerOrFinance = requirePermission(
  'payment_voucher',
  'update',
);
export const outletOwnerOnly = requirePermission('settings', 'update');
export const outletOwnerOrOps = requirePermission('booking', 'create');
export const outletOwnerOrOpsIfMember = requireOutletSubRoleIfMember(
  'owner',
  'operations_head',
);
