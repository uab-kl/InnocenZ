/**
 * WEB binding for the saved session (Metro picks `saved-session.native.ts` on a
 * phone, and this file in a browser). `expo-secure-store` has no web
 * implementation, and keeping it in the `.native` twin is what stops the web
 * bundle from ever loading it.
 *
 * sessionStorage is this tab's own; localStorage only seeds new tabs — see
 * `createWebPersistence`.
 */
import { createWebPersistence, type WebStorage } from './session-persistence';

export const savedSession = createWebPersistence(
  () => (globalThis as { sessionStorage?: WebStorage }).sessionStorage ?? null,
  () => (globalThis as { localStorage?: WebStorage }).localStorage ?? null,
);
