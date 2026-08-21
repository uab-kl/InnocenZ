import { Request } from 'express';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';

/**
 * How a caller is confined when reading/writing org-owned resources (shifts,
 * assignments, sales): admin (everything), agency member (their agency), or
 * outlet member (their own venues). `outletIds` is empty for non-outlet callers.
 * Always resolved from the DB — never trusted from the request body.
 */
export type OrgScope = {
  isAdmin: boolean;
  agencyId: string | null;
  outletIds: string[];
};

/** The repositories `resolveOrgScope` needs; controllers already hold all three. */
export type OrgScopeDeps = {
  authRepository: AuthRepositoryClass;
  agencyMemberRepository: AgencyMemberRepositoryClass;
  outletMemberRepository: OutletMemberRepositoryClass;
};

/** True when the caller is an outlet operator (no admin/agency scope, ≥1 outlet). */
export function isOutletCaller(scope: OrgScope): boolean {
  return !scope.isAdmin && !scope.agencyId && scope.outletIds.length > 0;
}

/**
 * The agency a caller acts for, or null. ACTIVE MEMBERSHIPS ONLY.
 *
 * Exported because this one line was copy-pasted into three controllers that do
 * NOT import this file — `payment-voucher.controller` twice (its private
 * `resolveScope`, and again inline in `listAgencyReceipts`) and
 * `pr.controller` — and every copy carried the same bug, so fixing
 * `resolveOrgScope` alone would have left the money lane open.
 *
 * Every copy ended `?? memberships[0]`, which took the FIRST row whatever its
 * status. `AgencyMemberRepository.remove` only flips `status` to 'inactive' and
 * `listByUser` has no status predicate, so removing a member revoked nothing:
 * the `find` missed, the fallback handed back the dead row, and the removed
 * operator's next request resolved their old agencyId as though they were still
 * staff. An inactive membership is not a weaker membership — it is the absence
 * of one, and the fallback was the only thing turning it back into one.
 *
 * Nothing legitimate is lost. `agency_user.status` is `varchar(50) NOT NULL
 * DEFAULT 'active'` with no enum behind it, and every path that inserts a row
 * writes 'active' literally (`auth.controller` register, both invite-accept
 * branches in `org-member-invite.controller`). There is no pending or invited
 * membership for the fallback to rescue — invites live in `org_member_invite`
 * with their own status, and the `agency_user` row is not created until the
 * invite is accepted. `remove()` is the only writer of anything else, and that
 * is exactly the case this must refuse.
 */
export function activeAgencyId(
  memberships: readonly { agencyId: string; status: string }[],
): string | null {
  return memberships.find((m) => m.status === 'active')?.agencyId ?? null;
}

/**
 * Admins see everything; every other caller is confined to the org they belong
 * to. Agency membership wins when a user somehow holds both, and the outlet
 * fallback lets a venue operator read the shifts/rosters/sales at its own venues.
 */
export async function resolveOrgScope(
  req: Request,
  deps: OrgScopeDeps,
): Promise<OrgScope> {
  const user = req.user!;
  const roles = await deps.authRepository.getRolesForUserIds([user.id]);
  const isAdmin = roles.some((r) => r.roleName === 'admin');
  if (isAdmin) return { isAdmin: true, agencyId: null, outletIds: [] };

  const memberships = await deps.agencyMemberRepository.listByUser(user.id);
  /**
   * `activeAgencyId`, not `find(...) ?? memberships[0]` — see the note on that
   * helper. The fallback re-admitted a removed member with the agency's FULL
   * scope across all 39 call sites of this function; `holdsAgencyLane` already
   * refused them, so sub-role-guarded writes failed closed, but every route
   * gated by `requireRole('agency')` alone did not, and those include reads of
   * the roster and of money.
   */
  const agencyId = activeAgencyId(memberships);
  if (agencyId) {
    return { isAdmin: false, agencyId, outletIds: [] };
  }

  const outletMemberships = await deps.outletMemberRepository.listByUser(
    user.id,
  );
  const outletIds = [
    ...new Set(
      outletMemberships
        .filter((m) => m.status === 'active')
        .map((m) => m.outletId),
    ),
  ];
  return { isAdmin: false, agencyId: null, outletIds };
}
