/**
 * NATIVE binding for the saved session: SecureStore — the iOS Keychain and the
 * Android Keystore — so a PR who closes the app is still signed in when she
 * opens it. Native used to keep the token in React state alone, and every
 * launch began at the sign-in screen.
 *
 * ⚠️ `expo-secure-store` is required on FIRST USE, never imported at the top.
 * Its JS asks for the native module the moment it is evaluated, and a binary
 * built before the module was added (an older dev client, an installed build
 * running newer JS) has none: a top-level import would crash the app at launch.
 * Without it the session is kept in memory for the life of the process — which
 * is exactly how native behaved before this file existed.
 */
import type * as SecureStoreModule from 'expo-secure-store';
import {
  createKeyValuePersistence,
  memoryKeyValueStore,
  type KeyValueStore,
} from './session-persistence';

let resolved: KeyValueStore | null = null;

function keyValueStore(): KeyValueStore {
  if (resolved) return resolved;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const secure = require('expo-secure-store') as typeof SecureStoreModule;
    resolved = {
      getItemAsync: (key) => secure.getItemAsync(key),
      setItemAsync: (key, value) => secure.setItemAsync(key, value),
      deleteItemAsync: (key) => secure.deleteItemAsync(key),
    };
  } catch {
    resolved = memoryKeyValueStore();
  }
  return resolved;
}

export const savedSession = createKeyValuePersistence(keyValueStore);
