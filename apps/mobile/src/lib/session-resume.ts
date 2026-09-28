/**
 * Opening the app on a session saved earlier: keep it whenever it can be kept.
 *
 * Only ONE answer ends a saved session — the server refusing its refresh token
 * (`Renewal.dead`, which has already cleared it). No signal, a backend in the
 * middle of a deploy, the login limiter's 429: none of that is the PR signing
 * out, so the session stays saved and the app says it cannot connect. Boot used
 * to clear the token on ANY failure of `/auth/me`, network errors included, so a
 * lift with no reception at the moment the app opened cost a sign-in.
 *
 * React-free; `session.tsx` supplies the calls.
 */
import type { Me } from './api';
import type { Renewal, SessionTokens } from './token-refresh';

export type ResumeResult =
  | { kind: 'signedIn'; me: Me }
  /** The server refused the session for good — sign in again. */
  | { kind: 'signedOut' }
  /** Could not confirm it right now. Still saved, still held; try again later. */
  | { kind: 'offline' };

export type ResumeDeps = {
  fetchMe(accessToken: string): Promise<Me>;
  renew(staleToken: string): Promise<Renewal>;
  /** The session still held — null once a refused refresh has ended it. */
  held(): SessionTokens | null;
  now(): number;
};

/**
 * Renew slightly early: a device clock a few seconds ahead of the server's
 * should cost nothing, not a refused request.
 */
const EXPIRY_MARGIN_MS = 30_000;

/** True when the saved expiry says the access token is (about to be) refused. Unknown → false. */
export function isExpired(expiredAt: number | null, now: number): boolean {
  return expiredAt !== null && expiredAt - EXPIRY_MARGIN_MS <= now;
}

export async function resumeSession(
  saved: SessionTokens,
  deps: ResumeDeps,
): Promise<ResumeResult> {
  let accessToken = saved.accessToken;
  // Known to be expired: renew first, rather than spend a request on a 401.
  if (isExpired(saved.expiredAt, deps.now())) {
    const renewal = await deps.renew(accessToken);
    if (renewal.kind === 'dead') return { kind: 'signedOut' };
    if (renewal.kind !== 'retry') return { kind: 'offline' };
    accessToken = renewal.accessToken;
  }
  try {
    return { kind: 'signedIn', me: await deps.fetchMe(accessToken) };
  } catch {
    // A refused token was already renewed inside `fetchMe` (api.ts) where that
    // was possible. A session still held after that was not refused for good —
    // the network, the limiter or the server failed us instead.
    return deps.held() ? { kind: 'offline' } : { kind: 'signedOut' };
  }
}
