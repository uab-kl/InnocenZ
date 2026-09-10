import type { UserRepositoryClass } from '@/features/user/user.repository.js';
import type { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository.js';
import { portalRoleName } from '@/types/rbac-constant.js';

/**
 * ⚠️ THE REPOSITORIES ARE PASSED IN, NOT IMPORTED FROM `composition-root`.
 *
 * This file is imported BY `agency.controller` and `outlet.controller`, which
 * the composition root itself imports — so reaching back for the singletons
 * closed a cycle (composition-root -> outlet.controller -> here ->
 * composition-root) and `OutletControllerClass` arrived at its own module as
 * `undefined`. It surfaced as `TypeError: OutletControllerClass is not a
 * constructor` in `outlet-update-radius.test.ts`, which is the cheap version
 * of the failure; `outlet.repository.ts` records that a latent cycle has taken
 * the agency portal down in production once already.
 *
 * Both controllers already hold these two, so injection costs nothing.
 */
export type InvitableDeps = {
  userRepository: UserRepositoryClass;
  userRoleRepository: UserRoleRepositoryClass;
};

/**
 * MAY THIS EMAIL BE INVITED ONTO AN ORGANISATION TEAM — asked once, for both
 * portals, at the moment the invitation is CREATED.
 *
 * Two owner rules live here, and they are checked at both ends of the flow
 * (here and again in `accept`) on purpose. A refusal only at accept time is
 * the worse half of the deal: the owner is told the invitation is on its way,
 * the email goes out, and the person is refused at the end of a link they were
 * asked to click.
 *
 * RULE 1 — the account must ALREADY EXIST and be able to log in (owner,
 * 10 Sep 2026). An invitation grants a ROLE to somebody who already exists; it
 * does not mint an identity. Inviting a stranger's address used to CREATE
 * their account from the accept form, which meant an organisation could
 * conjure a member out of an email address nobody had confirmed.
 *
 * ⚠️ This was briefly `pr`-only, on the reasoning that web sign-up registers
 * ORGANISATIONS so an individual could only exist as a PR account. The
 * member sign-up removes that premise — a person can now register as a team
 * member without an organisation — so the test is any loginable account
 * rather than a particular role. Admin is still refused, below.
 *
 * RULE 2 — an ADMIN is not an organisation's team member. The admin console
 * belongs to no organisation, and a membership row would have every
 * organisation-scoped guard judge that admin by a job title at somebody
 * else's company.
 *
 * ⚠️ Rule 2 also closes an account-takeover path, which is why it is a
 * refusal rather than a warning: `addMember` returns the raw `acceptUrl` to
 * the INVITER, so before this an owner could invite an admin's address, read
 * the link out of their own API response and — through the old
 * `resolveInviteUser` — set a new password on that admin's account. The
 * credential write is gone too; this stops the invitation being issued at all.
 *
 * Returns a refusal message, or `null` when the invitation may proceed.
 */
export async function refuseUninvitableAccount(
  deps: InvitableDeps,
  email: string,
): Promise<string | null> {
  const account = await deps.userRepository.getUserByLoginMethod(
    'email',
    email,
  );
  if (!account) {
    return 'That email has no InnocenZ account yet — ask them to sign up first, then invite them.';
  }
  /*
   * `status` is the ACCOUNT's, not a membership's: a blocked or deactivated
   * account cannot sign in, and an invitation it can never accept is worse
   * than no invitation, because it looks sent.
   */
  if (account.status !== 'active') {
    return 'That account cannot sign in at the moment — it must be reactivated before it can join a team.';
  }
  const roles = await deps.userRoleRepository.getUserRoles(account.id);
  if (roles.some((r) => r.roleName === portalRoleName.ADMIN)) {
    return 'That account is an InnocenZ admin and cannot join an organisation team.';
  }
  return null;
}
