import { Request, Response, NextFunction } from 'express';
import {
  agencyMemberRepository,
  agencyOutletRepository,
  authRepository,
  outletMemberRepository,
} from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map.js';
import { requirePermission } from '@/middlewares/require-permission.js';
import { portalRoleName } from '@/types/rbac-constant.js';
import { paramId } from '@/util/params.js';
import {
  type OrgScopeDeps,
  pickAgencyId,
  pickedOrgKind,
  resolveActingOrgId,
  resolveOrgScope,
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
/**
 * Does this person hold one of `allowed` at this organisation?
 *
 * `foldGuarantor` (default TRUE) is the stand-in rule: a guarantor passes
 * wherever an owner passes. Pass FALSE only where the owner's rule is that the
 * stand-in does NOT stand in — today that is paying and payment methods:
 * "guarantor no payment made like other member just see paid and unpaid"
 * (owner, 12 Sep 2026). Everywhere else the fold must stay on, because a
 * missed call site would refuse the stand-in at the one moment the role
 * exists for.
 */async function holdsAgencyLane(
  userId: string,
  agencyId: string,
  allowed: readonly AgencySubRole[],
  foldGuarantor = true,
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
  return foldGuarantor && lane === 'guarantor' && allowed.includes('owner');
}

/** The venue twin — see `holdsAgencyLane` for why `outletId` is required. */
async function holdsOutletLane(
  userId: string,
  outletId: string,
  allowed: readonly OutletSubRole[],
  foldGuarantor = true,
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
  return foldGuarantor && lane === 'guarantor' && allowed.includes('owner');
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

/**
 * THE SAME SHAPE AS `requireOutletSubRoleIfMember`, BUT THE DATABASE DECIDES.
 *
 * The lane version hard-codes `('owner','operations_head')` on routes the
 * PORTAL gates on a module grant, and outlet Finance holds those grants:
 * `workspace` CRU and `sales` CRU. So Finance was shown Workspace's editable
 * rate card and its Save button, pressed Save, and got a warn toast while
 * nothing persisted — the venue believing its pay rates had changed. Same for
 * logging sales and event templates.
 *
 * ⚠️ THE SHORT-CIRCUIT IS PRESERVED EXACTLY, and it is the point of the guard:
 * AGENCY callers share these routes and hold NO venue membership at all, so
 * `no active venue membership ANYWHERE` must still pass. Narrowing that to the
 * named venue 403s every agency caller — a regression commit 4c7151c already
 * had to revert once. Only the final test changes, from a lane list to
 * `roleHasPermission`, which is what makes `role_permission` the authority
 * here as everywhere else.
 */
export function requireOutletPermissionIfMember(
  moduleKey: string,
  permissionType: 'create' | 'read' | 'update',
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

      // The agency escape hatch — see the note above.
      const memberships = await outletMemberRepository.listByUser(user.id);
      const active = memberships.filter((m) => m.status === 'active');
      if (active.length === 0) return next();

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
          message: 'Which venue? Send x-org-id, or name it in the request.',
          data: null,
        });
      }

      const here = active.find((m) => m.outletId === outletId);
      if (!here) {
        return res.status(403).json({
          success: false,
          message: Error.FORBIDDEN ?? 'Forbidden',
          data: null,
        });
      }

      const roleName = portalRoleNameForSubRole('outlet', here.subRole);
      const ok = await authRepository.roleHasPermission(
        roleName,
        'outlet',
        moduleKey,
        permissionType,
      );
      if (!ok) {
        return res.status(403).json({
          success: false,
          message: `Forbidden — requires ${moduleKey}:${permissionType}`,
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

/**
 * THE PERSON WHO PAYS — the OWNER ALONE, on whichever portal they are acting
 * for, scoped to the organisation being paid for.
 *
 * Owner, 11 Sep 2026: "only the owner can make payment fpx and the set and
 * update the payment method", REFINED 12 Sep 2026: "owner priority to get
 * charge, guarantor no payment made like other member just see paid and
 * unpaid, owner make payment fpx and the payment method continue."
 *
 * ⚠️ THE GUARANTOR IS EXCLUDED HERE AND ONLY HERE. Everywhere else the
 * stand-in passes wherever the owner passes — they change the org address,
 * approve members, edit settings. Money is the exception the owner drew by
 * hand: the guarantor sees which invoices are paid and unpaid, like any other
 * member, and cannot spend or change how the organisation pays.
 *
 * Because only the owner may SAVE a method, the organisation's single stored
 * method is by definition the owner's — so "owner priority to get charge" is
 * satisfied by this gate alone, with no per-person payment_method column.
 *
 * ⚠️ `POST /subscription-payment/checkout` carried `requireRole('agency',
 * 'outlet')` — every lane on both portals. An outlet Finance head, Ops Head or
 * Director could tick overdue periods and start a REAL FPX checkout, from the
 * browser or from curl. The controller checks that the invoices belong to the
 * caller's organisation, which is a different question from whether that person
 * may spend its money.
 *
 * Why not `requirePermission('settings', 'update')`, which is what the portals
 * already use for "owner or guarantor": that helper resolves ONE portal from
 * the module key, and `settings` exists as a separate module row on BOTH — so
 * it would answer for whichever row it happened to find. This route serves both
 * portals, so it has to ask per portal.
 *
 * The lane list is `['owner']` AND every call passes `foldGuarantor: false`.
 * The lane list alone is not enough: `holdsAgencyLane` / `holdsOutletLane`
 * fold guarantor into owner by default, so `['owner']` on its own admits the
 * stand-in — which is right everywhere except money.
 *
 * Admin is deliberately NOT admitted, matching the route's own note: an admin
 * marks money as received, it does not pay on a venue's behalf.
 */
/**
 * The three answers `orgOwnerPaysOnly` can reach. `no-org` is not a refusal —
 * it means the request never said which organisation it was acting for.
 */
export type OrgOwnerPayerVerdict = 'owner' | 'refused' | 'no-org';

/**
 * THE SAME QUESTION `orgOwnerPaysOnly` ASKS, answerable from inside a handler.
 *
 * ⚠️ Extracted 13 Sep 2026 because a gate only a ROUTE can ask is a gate a
 * RESPONSE BODY gets to contradict. `GET /subscription-payment/invoice/:id` is
 * deliberately open to every member — "did our payment go through" is a fair
 * question for anyone in the org — but its handler also read the org's saved
 * payment methods straight out of `paymentMethodRepository` and shipped them,
 * so brand, last four, expiry, holder name and billing details reached exactly
 * the people the five `/payment-method` routes spend five guards keeping them
 * from. The owner's rule (12 Sep 2026) is that everyone else "just see paid and
 * unpaid".
 *
 * Returning a verdict rather than a boolean keeps the middleware's three
 * distinct replies — 403 "only the owner can pay" and 400 "which
 * organisation?" say different things and must not collapse into one.
 */
export async function resolveOrgOwnerPayer(
  req: Request,
): Promise<OrgOwnerPayerVerdict> {
  const user = req.user;
  if (!user) return 'refused';

  /*
   * ⚠️ THE SAME RESOLUTION THE CONTROLLER USES — `resolveOrgScope`, not a
   * second opinion.
   *
   * This guard first looped agency-then-outlet and passed the moment EITHER
   * said owner, without recording which. The controller then re-resolved the
   * org its own way, so the org that AUTHORISED was not the org that PAID:
   * somebody who is Finance at agency A and owns their own venue V passed on
   * V's ownership, while `resolveOrgScope` hands the controller A — and A's
   * invoices then satisfied its ownership check. An agency Finance head could
   * spend the agency's money, which is exactly what this exists to stop.
   *
   * Asking the same question the controller asks is the only version that
   * cannot disagree with it.
   */
  const scope = await resolveOrgScope(req, orgScopeDeps);

  /*
   * ⚠️ AN ADMIN WHO IS ALSO THE OWNER pays for their OWN organisation.
   *
   * `resolveOrgScope` short-circuits on admin and returns no organisation at
   * all, so both branches below missed and this fell to the terminal 400 asking
   * for `x-org-id` — a header the portals already send, which reads as a broken
   * client rather than a rule, and left the owner unable to pay at all.
   *
   * The route's rule is that an admin does not pay on a VENUE'S BEHALF. It was
   * never that somebody who happens to hold admin may not pay for the
   * organisation they themselves signed up and own — and the owner enabled
   * exactly that account shape on 11 Sep 2026 ("make admin can be the org team
   * member").
   *
   * So the lane is checked exactly as it is for everyone else: `holdsXLane`
   * against the organisation being acted for. An admin with no owner lane there
   * still gets the 403 below — admin-ness opens nothing on its own.
   */
  if (scope.isAdmin) {
    const kind = pickedOrgKind(req);
    for (const org of (kind ? [kind] : ['agency', 'outlet']) as Array<
      'agency' | 'outlet'
    >) {
      const orgId = await resolveActingOrgId(req, orgScopeDeps, org);
      if (!orgId) continue;
      const holds =
        org === 'agency'
          ? await holdsAgencyLane(user.id, orgId, ['owner'], false)
          : await holdsOutletLane(user.id, orgId, ['owner'], false);
      if (holds) return 'owner';
    }
    return 'refused';
  }

  if (scope.agencyId) {
    return (await holdsAgencyLane(user.id, scope.agencyId, ['owner'], false))
      ? 'owner'
      : 'refused';
  }

  /*
   * Every venue in scope, not merely one: the controller accepts invoices for
   * any of them, so ownership of one must not authorise the rest.
   */
  if (scope.outletIds.length > 0) {
    for (const outletId of scope.outletIds) {
      if (!(await holdsOutletLane(user.id, outletId, ['owner'], false))) {
        return 'refused';
      }
    }
    return 'owner';
  }

  return 'no-org';
}

/**
 * The same verdict, RECORDED rather than enforced — for a route that everyone
 * may call but whose response carries something only the payer may see.
 *
 * ⚠️ Deliberately a middleware and not an import the handler makes for itself:
 * this module reads its repositories from `composition-root.js`, which
 * constructs the controllers, so a controller importing it closes a cycle. And
 * because `orgScopeDeps` is captured at module-evaluation time, that cycle
 * would not throw — it would bind `undefined` and every lane check would answer
 * wrongly and silently. A route file already imports both, so this is the one
 * place the question can be asked safely.
 *
 * Never refuses. The handler decides what to withhold.
 */
export const attachOrgOwnerPayer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.locals.orgOwnerPayer = req.user
    ? await resolveOrgOwnerPayer(req)
    : 'refused';
  next();
};

export const orgOwnerPaysOnly = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: Error.UNAUTHORIZED, data: null });
  }
  switch (await resolveOrgOwnerPayer(req)) {
    case 'owner':
      return next();
    case 'refused':
      return refuse(res);
    default:
      return res.status(400).json({
        success: false,
        message: 'Which organisation? Send x-org-id, or name it in the request.',
        data: null,
      });
  }
};

function refuse(res: Response) {
  return res.status(403).json({
    success: false,
    message: 'Only the organisation owner can pay a subscription invoice.',
    data: null,
  });
}

/**
 * @deprecated NO CALL SITES as of 12 Sep 2026 — kept only so a teammate's
 * branch does not break on the missing export.
 *
 * ⚠️ Do not reach for this. It hard-codes a LANE where the portal gates the
 * same buttons on a PERMISSION, and that split is what let the web matrix
 * promise something the server refused: rostering showed `assignShifts` while
 * these routes asked for the owner lane. Gate on `requirePermission(module,
 * verb)` so `role_permission` stays the single answer — the standing rule.
 */
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
