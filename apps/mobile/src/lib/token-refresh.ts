/**
 * RENEWING THE SESSION — one refresh at a time, shared by everyone waiting.
 *
 * Production access tokens live 15 minutes; the refresh token issued with them
 * lives 7 days and is traded at `POST /auth/refresh` for a new access token (it
 * is not rotated). The app used to throw the refresh token away at sign-in, so
 * every session died a quarter of an hour in: each later call answered 401 and
 * each screen failed in its own way.
 *
 * `session.tsx` registers a TokenProvider — the pair it holds, read from a ref
 * so a render closure can never answer with a stale one. `api.ts` asks
 * `renewSession` what to do when a request that carried a Bearer token is
 * refused as a SESSION (401 'Unauthorized', see `isSessionRefusal`), and sends
 * that request once more with the token it gets back.
 *
 * React-free, and it never imports api.ts: the HTTP exchange is handed in, which
 * keeps the import graph one-way and lets the tests drive it without a network.
 */

export type SessionTokens = {
  accessToken: string;
  /** Null only for a session saved before refresh tokens were kept — it cannot renew. */
  refreshToken: string | null;
  /** Epoch ms at which the access token stops working (the server's `expiredAt`), when known. */
  expiredAt: number | null;
};

/** What `/auth/refresh` answered, sorted by what the caller has to do about it. */
export type RefreshOutcome =
  | { kind: 'renewed'; accessToken: string; expiredAt: number | null }
  /** The refresh token itself was refused. The session is over. */
  | { kind: 'dead' }
  /**
   * Nobody could be asked — no connection, the 429 of the limiter this endpoint
   * shares with login, a 5xx. None of that ends a session; it stays as it is.
   */
  | { kind: 'unavailable' };

export type RefreshExchange = (refreshToken: string) => Promise<RefreshOutcome>;

/** What `session.tsx` lends this module. */
export type TokenProvider = {
  /** The pair held right now — from a ref, never from a render. */
  current(): SessionTokens | null;
  /** A refresh minted a new access token: store it and hand it to React. */
  renewed(next: SessionTokens): void;
  /** The refresh token was refused: forget the session everywhere. */
  dead(): void;
};

/** What to do with a request the server refused. */
export type Renewal =
  /** Send it again with this token. */
  | { kind: 'retry'; accessToken: string }
  /** The session is over, and `TokenProvider.dead` has already run. */
  | { kind: 'dead' }
  /** Could not renew right now. Keep the session; the original refusal stands. */
  | { kind: 'unavailable' }
  /**
   * The refused token is not this session's — another account's, or there is
   * no session at all. It is never swapped for the current token: that would
   * send one person's request under another person's name.
   */
  | { kind: 'foreign' };

type InFlight = { staleToken: string; renewal: Promise<Renewal> };

let provider: TokenProvider | null = null;
/** The refresh under way, if any — everyone refused with the same token joins it. */
let inFlight: InFlight | null = null;
/**
 * Access tokens THIS account held before the current one, newest last. A
 * request still out with one of them lost a race, not its session: it is sent
 * again with the current token, without another refresh.
 */
let superseded: string[] = [];
const SUPERSEDED_KEPT = 16;

/** Returns the unregister function — hand it straight back from a `useEffect`. */
export function registerTokenProvider(next: TokenProvider): () => void {
  provider = next;
  inFlight = null;
  superseded = [];
  return () => {
    if (provider !== next) return;
    provider = null;
    inFlight = null;
    superseded = [];
  };
}

/**
 * The same account moved to a new access token — a pair the server re-issued
 * after a credential change. Requests still out with the old one may be sent
 * again with the new one. (A refresh records its own predecessor.)
 */
export function noteSupersededToken(previous: string): void {
  if (!previous || superseded.includes(previous)) return;
  superseded = [...superseded, previous].slice(-SUPERSEDED_KEPT);
}

/** A different account signed in, or nobody is: no older token may stand in for the current one. */
export function forgetSupersededTokens(): void {
  superseded = [];
}

/**
 * The server refused `staleToken`: renew the session if that is possible, and
 * say what the refused request should do next. Never throws.
 *
 * Refusals of the SAME token share ONE refresh — ten requests arriving together
 * after the 15 minutes are up make one call to `/auth/refresh`, not ten, which
 * matters because that endpoint shares login's per-IP limiter.
 */
export function renewSession(
  staleToken: string,
  exchange: RefreshExchange,
): Promise<Renewal> {
  const current = provider;
  const held = current?.current() ?? null;
  if (!current || !held) return Promise.resolve({ kind: 'foreign' });
  if (staleToken !== held.accessToken) {
    return Promise.resolve(
      superseded.includes(staleToken)
        ? { kind: 'retry', accessToken: held.accessToken }
        : { kind: 'foreign' },
    );
  }
  const refreshToken = held.refreshToken;
  if (!refreshToken) {
    // A session saved before refresh tokens were kept, and now refused: there
    // is nothing to renew it with.
    current.dead();
    return Promise.resolve({ kind: 'dead' });
  }
  if (!inFlight || inFlight.staleToken !== staleToken) {
    const renewal: Promise<Renewal> = settle(
      current,
      staleToken,
      refreshToken,
      exchange,
    ).finally(() => {
      if (inFlight?.renewal === renewal) inFlight = null;
    });
    inFlight = { staleToken, renewal };
  }
  return inFlight.renewal;
}

async function settle(
  owner: TokenProvider,
  staleToken: string,
  refreshToken: string,
  exchange: RefreshExchange,
): Promise<Renewal> {
  let outcome: RefreshOutcome;
  try {
    outcome = await exchange(refreshToken);
  } catch {
    outcome = { kind: 'unavailable' };
  }
  const held = provider === owner ? owner.current() : null;
  // Signed out, signed in as someone else, or handed a re-issued pair while the
  // server was asked: the answer is about a session nobody holds any more.
  if (!held || held.refreshToken !== refreshToken) {
    return held && superseded.includes(staleToken)
      ? { kind: 'retry', accessToken: held.accessToken }
      : { kind: 'foreign' };
  }
  if (outcome.kind === 'renewed') {
    noteSupersededToken(staleToken);
    owner.renewed({
      accessToken: outcome.accessToken,
      refreshToken,
      expiredAt: outcome.expiredAt,
    });
    return { kind: 'retry', accessToken: outcome.accessToken };
  }
  if (outcome.kind === 'dead') {
    owner.dead();
    return { kind: 'dead' };
  }
  return { kind: 'unavailable' };
}
