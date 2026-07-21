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
export type OrgScope = { isAdmin: boolean; agencyId: string | null; outletIds: string[] };

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
 * Admins see everything; every other caller is confined to the org they belong
 * to. Agency membership wins when a user somehow holds both, and the outlet
 * fallback lets a venue operator read the shifts/rosters/sales at its own venues.
 */
export async function resolveOrgScope(req: Request, deps: OrgScopeDeps): Promise<OrgScope> {
  const user = req.user!;
  const roles = await deps.authRepository.getRolesForUserIds([user.id]);
  const isAdmin = roles.some((r) => r.roleName === 'admin');
  if (isAdmin) return { isAdmin: true, agencyId: null, outletIds: [] };

  const memberships = await deps.agencyMemberRepository.listByUser(user.id);
  const active = memberships.find((m) => m.status === 'active') ?? memberships[0];
  if (active?.agencyId) {
    return { isAdmin: false, agencyId: active.agencyId, outletIds: [] };
  }

  const outletMemberships = await deps.outletMemberRepository.listByUser(user.id);
  const outletIds = [
    ...new Set(
      outletMemberships.filter((m) => m.status === 'active').map((m) => m.outletId),
    ),
  ];
  return { isAdmin: false, agencyId: null, outletIds };
}
