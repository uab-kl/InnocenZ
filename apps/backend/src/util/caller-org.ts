import { Request } from 'express';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import type { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import type { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';

/**
 * Which organisation the caller belongs to.
 *
 * `isAdmin` sees everything. Otherwise exactly one of agencyId / outletId is
 * normally set; a caller with neither (a PR, or an account whose membership was
 * removed) gets nulls and must be refused by whoever called this.
 */
export type CallerOrg = {
  isAdmin: boolean;
  agencyId: string | null;
  outletId: string | null;
};

export type CallerOrgDeps = {
  authRepository: AuthRepositoryClass;
  agencyMemberRepository: AgencyMemberRepositoryClass;
  outletMemberRepository: OutletMemberRepositoryClass;
};

/**
 * Resolves the caller's org from the DATABASE, never from the request.
 *
 * Three controllers already grew their own private copy of this
 * (payment-voucher, shift-assignment, rating). This exists so the two features
 * that had NO scoping at all — member-subscription and special-service — get
 * the same rule rather than a fourth variant of it.
 *
 * Prefers an active membership and falls back to the first one, matching what
 * the existing resolvers do: a suspended membership is still an association,
 * and refusing outright would lock someone out of their own history.
 */
export async function resolveCallerOrg(
  req: Request,
  deps: CallerOrgDeps,
): Promise<CallerOrg> {
  const userId = req.user?.id;
  if (!userId) return { isAdmin: false, agencyId: null, outletId: null };

  const roles = await deps.authRepository.getRolesForUserIds([userId]);
  if (roles.some((role) => role.roleName === 'admin')) {
    return { isAdmin: true, agencyId: null, outletId: null };
  }

  const [agencyMemberships, outletMemberships] = await Promise.all([
    deps.agencyMemberRepository.listByUser(userId),
    deps.outletMemberRepository.listByUser(userId),
  ]);

  const agency =
    agencyMemberships.find((m) => m.status === 'active') ?? agencyMemberships[0];
  const outlet =
    outletMemberships.find((m) => m.status === 'active') ?? outletMemberships[0];

  return {
    isAdmin: false,
    agencyId: agency?.agencyId ?? null,
    outletId: outlet?.outletId ?? null,
  };
}
