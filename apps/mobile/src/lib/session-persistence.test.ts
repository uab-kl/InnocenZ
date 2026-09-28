// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  NATIVE_SESSION_KEY,
  WEB_SESSION_KEYS,
  createKeyValuePersistence,
  createWebPersistence,
  memoryKeyValueStore,
  type KeyValueStore,
  type WebStorage,
} from './session-persistence';
import type { SessionTokens } from './token-refresh';

/**
 * WHERE A SESSION WAITS BETWEEN LAUNCHES, driven through fake storages.
 *
 * Web keeps the rule the access token alone always had — each tab its OWN PR,
 * localStorage only seeding a brand-new tab — and must now carry the refresh
 * token and expiry with it, all three together. Native keeps one value in a
 * store whose calls are asynchronous, so the ORDER of writes is pinned: a
 * refresh still being saved when the PR taps Sign out must not resurrect the
 * session she just ended.
 */

function fakeStorage(seed: Record<string, string> = {}): WebStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const SIGNED_IN: SessionTokens = { accessToken: 'A1', refreshToken: 'R1', expiredAt: 1_900_000 };

describe('web — this tab, and new tabs seeded from the latest sign-in', () => {
  test('a sign-in lands in the tab AND seeds new tabs, all three keys', async () => {
    const tab = fakeStorage();
    const shared = fakeStorage();
    const web = createWebPersistence(() => tab, () => shared);

    await web.save(SIGNED_IN, 'signIn');

    for (const storage of [tab, shared]) {
      expect(storage.getItem(WEB_SESSION_KEYS.accessToken)).toBe('A1');
      expect(storage.getItem(WEB_SESSION_KEYS.refreshToken)).toBe('R1');
      expect(storage.getItem(WEB_SESSION_KEYS.expiredAt)).toBe('1900000');
    }
  });

  test('a refresh stays in its own tab, so it cannot overwrite another tab’s newer sign-in', async () => {
    const tab = fakeStorage();
    const shared = fakeStorage({ [WEB_SESSION_KEYS.accessToken]: 'OTHER-PR' });
    const web = createWebPersistence(() => tab, () => shared);

    await web.save({ ...SIGNED_IN, accessToken: 'A2' }, 'refresh');

    expect(tab.getItem(WEB_SESSION_KEYS.accessToken)).toBe('A2');
    expect(shared.getItem(WEB_SESSION_KEYS.accessToken)).toBe('OTHER-PR');
  });

  test('a tab reads its own session before the shared seed', async () => {
    const tab = fakeStorage({ [WEB_SESSION_KEYS.accessToken]: 'MINE' });
    const shared = fakeStorage({ [WEB_SESSION_KEYS.accessToken]: 'LATEST' });
    const web = createWebPersistence(() => tab, () => shared);

    expect((await web.load())?.accessToken).toBe('MINE');
  });

  test('a brand-new tab adopts the shared seed whole, then lives on its own copy', async () => {
    const tab = fakeStorage();
    const shared = fakeStorage();
    const web = createWebPersistence(() => tab, () => shared);
    await web.save(SIGNED_IN, 'signIn');
    tab.data.clear();

    const loaded = await web.load();

    expect(loaded).toEqual(SIGNED_IN);
    expect(tab.getItem(WEB_SESSION_KEYS.refreshToken)).toBe('R1');
  });

  test('a session saved by the previous build (access token only) still loads — it just cannot renew', async () => {
    const tab = fakeStorage({ [WEB_SESSION_KEYS.accessToken]: 'OLD-BUILD' });
    const web = createWebPersistence(() => tab, () => null);

    expect(await web.load()).toEqual({
      accessToken: 'OLD-BUILD',
      refreshToken: null,
      expiredAt: null,
    });
  });

  test('a re-issued pair with no expiry REMOVES the old expiry, rather than inheriting it', async () => {
    const tab = fakeStorage();
    const web = createWebPersistence(() => tab, () => null);
    await web.save(SIGNED_IN, 'signIn');

    await web.save({ accessToken: 'A2', refreshToken: 'R2', expiredAt: null }, 'signIn');

    // Kept, the old expiry would make the new token look expired at next launch.
    expect(tab.getItem(WEB_SESSION_KEYS.expiredAt)).toBeNull();
    expect(await web.load()).toEqual({ accessToken: 'A2', refreshToken: 'R2', expiredAt: null });
  });

  test('sign-out clears all three keys from the tab and the seed', async () => {
    const tab = fakeStorage();
    const shared = fakeStorage();
    const web = createWebPersistence(() => tab, () => shared);
    await web.save(SIGNED_IN, 'signIn');

    await web.clear();

    expect(tab.data.size).toBe(0);
    expect(shared.data.size).toBe(0);
  });

  test('storage that throws on access costs a sign-in, never a crash', async () => {
    const blocked = (): WebStorage => {
      throw new Error('SecurityError: access denied');
    };
    const web = createWebPersistence(blocked, blocked);

    await expect(web.save(SIGNED_IN, 'signIn')).resolves.toBeUndefined();
    await expect(web.load()).resolves.toBeNull();
    await expect(web.clear()).resolves.toBeUndefined();
  });
});

describe('native — one value in SecureStore, written in order', () => {
  test('saves the pair as ONE value and loads it back', async () => {
    const store = memoryKeyValueStore();
    const native = createKeyValuePersistence(() => store);

    await native.save(SIGNED_IN, 'signIn');

    expect(JSON.parse((await store.getItemAsync(NATIVE_SESSION_KEY)) ?? 'null')).toEqual(SIGNED_IN);
    expect(await native.load()).toEqual(SIGNED_IN);
  });

  test('a save still in flight when Sign out is tapped cannot outlive the clear', async () => {
    // A keychain write that takes a while — the refresh being saved.
    const inner = memoryKeyValueStore();
    let releaseWrite!: () => void;
    const slowWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const store: KeyValueStore = {
      getItemAsync: (key) => inner.getItemAsync(key),
      setItemAsync: async (key, value) => {
        await slowWrite;
        await inner.setItemAsync(key, value);
      },
      deleteItemAsync: (key) => inner.deleteItemAsync(key),
    };
    const native = createKeyValuePersistence(() => store);

    const saving = native.save(SIGNED_IN, 'refresh');
    const clearing = native.clear();
    releaseWrite();
    await Promise.all([saving, clearing]);

    expect(await native.load()).toBeNull();
  });

  test('a store that fails answers "no session" and swallows writes — never throws', async () => {
    const broken: KeyValueStore = {
      getItemAsync: async () => {
        throw new Error('Could not decrypt the value');
      },
      setItemAsync: async () => {
        throw new Error('keystore unavailable');
      },
      deleteItemAsync: async () => {
        throw new Error('keystore unavailable');
      },
    };
    const native = createKeyValuePersistence(() => broken);

    await expect(native.save(SIGNED_IN, 'signIn')).resolves.toBeUndefined();
    await expect(native.load()).resolves.toBeNull();
    await expect(native.clear()).resolves.toBeUndefined();
  });

  test('a stored value that is not a session is ignored rather than trusted', async () => {
    const store = memoryKeyValueStore();
    await store.setItemAsync(NATIVE_SESSION_KEY, JSON.stringify({ refreshToken: 'R1' }));
    const native = createKeyValuePersistence(() => store);

    expect(await native.load()).toBeNull();
  });
});
