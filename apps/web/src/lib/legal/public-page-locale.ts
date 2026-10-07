import { readLandingLocalePick } from "@/lib/landing-i18n/context";
import { loadLocale, type PortalLocale } from "@/lib/portal-i18n/locale-prefs";

/**
 * The language /about and /legal speak. They are opened from the landing
 * footer, so the visitor's pick on the LANDING switcher wins — the landing and
 * the portals keep separate preferences, and following only the portal's left
 * a 中文 visitor reading English one click later. With no landing pick it
 * falls back to the portal's own rule (stored pick, then browser language).
 *
 * Read-only on purpose: writing the portal preference from here would also
 * change a signed-in user's saved account language.
 *
 * Client-only — call it after mount. During SSR both reads answer English.
 */
export function resolvePublicPageLocale(): PortalLocale {
	return readLandingLocalePick() ?? loadLocale();
}
