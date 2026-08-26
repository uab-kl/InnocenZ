/**
 * The reader's dictionary for copy thrown OUTSIDE React.
 *
 * `password-api` and `profile-api` are plain async functions — no component,
 * no hook — and every call site renders `error.message` verbatim, so a
 * last-resort English sentence thrown from here lands untranslated in a toast.
 * `usePortalLocale()` cannot be reached from a module-scope function, and the
 * call sites live in files this pass does not own.
 *
 * `loadLocale()` is the SAME reader `PortalLocaleProvider` runs on mount, so
 * the two cannot disagree about the session's language. It is safe to call
 * here and nowhere near a render: these functions only ever run inside a user
 * gesture (a save, an upload, a password change), never during SSR or the
 * first paint, which is the window where a module-scope storage read would
 * produce a hydration mismatch.
 *
 * ⚠️ FALLBACKS ONLY. When the server sends a message that message still wins —
 * it is the specific one ("Current password is incorrect") and a generic
 * sentence from here would throw the useful half away.
 *
 * Imports stay on the two LEAF i18n modules (`locale-prefs`, `translations`).
 * `portal-i18n/context` must never be imported here: it imports `lib/auth`
 * back, and that cycle is what once took the whole agency portal down.
 */
import { loadLocale } from "@/lib/portal-i18n/locale-prefs";
import {
	type PortalTranslations,
	translations,
} from "@/lib/portal-i18n/translations";

export function apiErrorCopy(): PortalTranslations {
	return translations[loadLocale()];
}
