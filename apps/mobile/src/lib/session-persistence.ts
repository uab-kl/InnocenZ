/**
 * Where the PR's session waits between launches: the access token, the refresh
 * token, and when the access token expires — written and cleared as one.
 *
 * Two shapes, and a platform binding picks one (`saved-session.ts` for web,
 * `saved-session.native.ts` for the phone). Nothing here imports a native
 * module, so both are testable, and web never loads `expo-secure-store`.
 *
 *   • web    — this tab's sessionStorage plus localStorage, the rule the access
 *              token alone always followed: each tab keeps its OWN PR across a
 *              reload, and localStorage only seeds a brand-new tab with the most
 *              recent sign-in. The refresh token and expiry sit beside it.
 *   • native — one JSON value in a key-value store (SecureStore: the iOS
 *              Keychain / Android Keystore). One value, so a pair is written
 *              whole or not at all.
 */
import type { SessionTokens } from './token-refresh';

export type SessionPersistence = {
  load(): Promise<SessionTokens | null>;
  /**
   * `signIn` is a new pair from the server (a sign-in, or one re-issued after a
   * credential change) and also seeds new web tabs. `refresh` renews this tab's
   * own session and stays in it, so it can never overwrite a more recent
   * sign-in that another tab made.
   */
  save(session: SessionTokens, why: 'signIn' | 'refresh'): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Web keys. The access token keeps the key it has always had, so a session a
 * previous build saved still loads — as one that cannot renew, until the next
 * sign-in brings a refresh token.
 */
export const WEB_SESSION_KEYS = {
  accessToken: 'iz-pr-token',
  refreshToken: 'iz-pr-refresh-token',
  expiredAt: 'iz-pr-token-expires-at',
} as const;

/** The one SecureStore key (letters, digits, `.`, `-` and `_` only). */
export const NATIVE_SESSION_KEY = 'iz-pr-session';

/** Minimal web storage surface — the RN tsconfig has no `dom` lib. */
export type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** SecureStore's own call shape, so it drops straight in. */
export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

function parseExpiry(raw: unknown): number | null {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** A value read back from storage, trusted only once it has the right shape. */
function asSession(raw: unknown): SessionTokens | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.accessToken !== 'string' || !r.accessToken) return null;
  return {
    accessToken: r.accessToken,
    refreshToken:
      typeof r.refreshToken === 'string' && r.refreshToken ? r.refreshToken : null,
    expiredAt: parseExpiry(r.expiredAt),
  };
}

function readWeb(storage: WebStorage | null): SessionTokens | null {
  if (!storage) return null;
  return asSession({
    accessToken: storage.getItem(WEB_SESSION_KEYS.accessToken),
    refreshToken: storage.getItem(WEB_SESSION_KEYS.refreshToken),
    expiredAt: storage.getItem(WEB_SESSION_KEYS.expiredAt),
  });
}

/**
 * All three keys, every time. A missing refresh token or expiry is REMOVED, not
 * skipped: a re-issued pair has no expiry, and the previous session's would
 * otherwise sit beside the new token and make it look expired at next launch.
 */
function writeWeb(storage: WebStorage | null, session: SessionTokens): void {
  if (!storage) return;
  storage.setItem(WEB_SESSION_KEYS.accessToken, session.accessToken);
  if (session.refreshToken) {
    storage.setItem(WEB_SESSION_KEYS.refreshToken, session.refreshToken);
  } else {
    storage.removeItem(WEB_SESSION_KEYS.refreshToken);
  }
  if (session.expiredAt !== null) {
    storage.setItem(WEB_SESSION_KEYS.expiredAt, String(session.expiredAt));
  } else {
    storage.removeItem(WEB_SESSION_KEYS.expiredAt);
  }
}

function removeWeb(storage: WebStorage | null): void {
  if (!storage) return;
  for (const key of Object.values(WEB_SESSION_KEYS)) storage.removeItem(key);
}

/**
 * Storages are passed as getters and read on every call, inside the try: a
 * browser with site data blocked throws on the mere ACCESS of `sessionStorage`.
 */
export function createWebPersistence(
  tabStorage: () => WebStorage | null,
  sharedStorage: () => WebStorage | null,
): SessionPersistence {
  return {
    async load() {
      try {
        const own = readWeb(tabStorage());
        if (own) return own;
        // Fresh tab: adopt the most recent sign-in once, then live per tab.
        const seed = readWeb(sharedStorage());
        if (seed) writeWeb(tabStorage(), seed);
        return seed;
      } catch {
        return null;
      }
    },
    async save(session, why) {
      try {
        writeWeb(tabStorage(), session);
        if (why === 'signIn') writeWeb(sharedStorage(), session);
      } catch {
        /* storage unavailable — this tab keeps the session in memory only */
      }
    },
    async clear() {
      try {
        removeWeb(tabStorage());
        removeWeb(sharedStorage());
      } catch {
        /* storage unavailable — nothing was kept to clear */
      }
    },
  };
}

/**
 * Every call runs strictly after the one before it. The store is asynchronous,
 * and without this a save still in progress when the PR taps Sign out could
 * finish AFTER the clear — leaving the session she just ended stored, to come
 * back at the next launch.
 *
 * A failed read answers null (sign in again) and a failed write is dropped: a
 * store that cannot be read or written must cost the PR a sign-in at worst,
 * never the app.
 */
export function createKeyValuePersistence(
  store: () => KeyValueStore,
): SessionPersistence {
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = queue.then(operation, operation);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    load: () =>
      inOrder(async () => {
        try {
          const raw = await store().getItemAsync(NATIVE_SESSION_KEY);
          return raw ? asSession(JSON.parse(raw)) : null;
        } catch {
          return null;
        }
      }),
    save: (session) =>
      inOrder(async () => {
        try {
          await store().setItemAsync(NATIVE_SESSION_KEY, JSON.stringify(session));
        } catch {
          /* not stored — the session lasts until the app closes */
        }
      }),
    clear: () =>
      inOrder(async () => {
        try {
          await store().deleteItemAsync(NATIVE_SESSION_KEY);
        } catch {
          /* nothing readable was stored */
        }
      }),
  };
}

/** A key-value store that lives as long as the JS runtime — the native fallback. */
export function memoryKeyValueStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
}
