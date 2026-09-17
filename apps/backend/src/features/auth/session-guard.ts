import type { UserType } from '@/features/user/user.model.js';
import { suspendedOrgBlock } from '@/features/auth/org-status.js';
import { isTokenBeforeCutoff } from '@/features/auth/session-cutoff.js';
import { logger } from '@/util/logger.js';

/** The one read this needs from AuthRepositoryClass — narrow, so tests can fake it. */
export type SessionSource = {
  getSessionByToken(
    token: string,
  ): Promise<{ user: UserType; issuedAt: Date | null; isRefresh: boolean } | null>;
};

export type SessionGuardDeps = {
  sessions: SessionSource;
  orgBlock?: (userId: string) => Promise<string | null>;
};

/**
 * WHO IS CALLING, with every rule a session must pass — or null.
 *
 * ONE implementation, used by `authenticateJWT`, `optionalAuthenticateJWT` and
 * the GraphQL context. The last two used to call `getUserDataByToken`, which
 * checks the signature and nothing else, so a refresh token, a token issued
 * before a password change, and a token inside a suspended organisation were
 * all refused by REST and accepted by GraphQL and by the optional routes. A
 * rule enforced on one door is a rule the next door ignores.
 *
 * The rules, and why each is here:
 *
 *  • The account must exist and be ACTIVE — re-read on every request rather
 *    than trusted from the token, so disabling somebody takes effect at once.
 *  • 🔴 A REFRESH TOKEN IS NOT A KEY TO THE API. Both generators signed the
 *    same payload, so `verifyToken` accepted either one anywhere; `GET /auth/me`
 *    answered 200 for a refresh token. Refused here, spent only at /auth/refresh.
 *  • 🔴 A PASSWORD OR CONTACT CHANGE ENDS THE SESSIONS OPENED BEFORE IT. The
 *    token is a stateless JWT, so without `sessions_valid_from` a reset returned
 *    200 while every token already issued kept working. Compared in WHOLE
 *    SECONDS (see `isTokenBeforeCutoff`): a token minted in the same second as
 *    the change survives, or the person making the change is thrown out by the
 *    token the change just re-issued. An undatable token (no `iat`) is let
 *    through — refusing it would sign out every token minted before `iat` was
 *    read.
 *  • Suspending an organisation has to kill the sessions already open inside
 *    it, not merely refuse the next login.
 *
 * Never throws: a lookup failure is "not signed in", which every caller already
 * treats as the safe reading.
 */
export async function resolveApiSessionUser(
  token: string | null | undefined,
  deps: SessionGuardDeps,
): Promise<UserType | null> {
  if (!token) return null;
  try {
    const session = await deps.sessions.getSessionByToken(token);
    if (!session || session.user.status !== 'active') return null;
    if (session.isRefresh) return null;
    if (isTokenBeforeCutoff(session.issuedAt, session.user.sessionsValidFrom)) return null;
    const orgBlock = deps.orgBlock ?? suspendedOrgBlock;
    if (await orgBlock(session.user.id)) return null;
    return session.user;
  } catch (error) {
    logger.warn('[session-guard] could not resolve session', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
