/**
 * UI locale for the signed-in portals (agency / outlet / admin).
 *
 * ⚠️ Three locale systems now exist in apps/web. They are not interchangeable:
 *
 * - `@/paraglide/runtime` — URL prefixes only (`/en/…`). It carries no message
 *   catalogue worth speaking of and nothing persists through it.
 * - `@/lib/landing-i18n` — the marketing site's own dictionary, keyed on
 *   `innocenz-landing-locale`. Scoped to the public pages by design.
 * - this module — the signed-in portals.
 *
 * The tag vocabulary is deliberately IDENTICAL to
 * `apps/mobile/src/i18n/locale-prefs.ts`, so the PR app and the web portals
 * agree on what a stored `zh` means. That file cannot simply be imported here:
 * it pulls in `react-native`.
 *
 * `zh` is SIMPLIFIED Chinese. `zh` is a language code; `cn` (which the unused
 * Paraglide stub still declares) is a COUNTRY code and is not used here.
 */

/** `zh` = Simplified Chinese (简体中文). */
export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type PortalLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: PortalLocale = "en";

const STORAGE_KEY = "innocenz-portal-locale";

/**
 * Survives a browser that refuses storage (private mode, blocked cookies).
 * Without it a picked language would silently revert on the next render.
 */
let memoryLocale: PortalLocale | null = null;

function isPortalLocale(value: unknown): value is PortalLocale {
	return (
		typeof value === "string" &&
		(SUPPORTED_LOCALES as readonly string[]).includes(value)
	);
}

/**
 * Parse a BCP-47 / Android `zh_CN` tag onto an app locale.
 *
 * Every Simplified variant collapses to `zh` — including `zh-MY`, which is the
 * one that actually matters here: this is a Malaysian product, and a Malaysian
 * Chinese browser reports `zh-MY`, not `zh-CN`.
 *
 * Traditional (`zh-Hant` / `zh-TW` / `zh-HK`) returns null rather than being
 * folded into Simplified. Serving 简体 to someone whose browser asked for 繁體
 * is a wrong answer; English is merely a neutral one, and the picker is right
 * there. The mobile app already ships a real `zh-Hant`; when the portals gain
 * one, this is the function that learns about it.
 */
export function localeFromTag(
	raw: string | null | undefined,
): PortalLocale | null {
	if (!raw) return null;
	const tag = raw.trim().replace(/_/g, "-");
	if (!tag) return null;

	const lower = tag.toLowerCase();

	if (
		lower.startsWith("zh-hant") ||
		lower.startsWith("zh-tw") ||
		lower.startsWith("zh-hk") ||
		lower.startsWith("zh-mo") ||
		lower === "zh-cht"
	) {
		return null;
	}

	if (
		lower === "zh" ||
		lower.startsWith("zh-hans") ||
		lower.startsWith("zh-cn") ||
		lower.startsWith("zh-sg") ||
		lower.startsWith("zh-my") ||
		lower === "zh-chs"
	) {
		return "zh";
	}

	if (lower.startsWith("en")) return "en";
	return null;
}

function browserStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/** Best-effort browser language, used only when nothing has been picked yet. */
export function localeFromBrowser(): PortalLocale {
	if (typeof navigator === "undefined") return DEFAULT_LOCALE;
	const candidates = [navigator.language, ...(navigator.languages ?? [])];
	for (const candidate of candidates) {
		const parsed = localeFromTag(candidate);
		if (parsed) return parsed;
	}
	return DEFAULT_LOCALE;
}

/**
 * Read the remembered locale.
 *
 * ⚠️ Returns DEFAULT_LOCALE during SSR on purpose. The server has no storage
 * and no `navigator`, so any other answer would differ from the server-rendered
 * HTML and trip a hydration mismatch. The provider re-reads this on the client
 * after mount, which is where a non-English pick actually takes effect.
 */
export function loadLocale(): PortalLocale {
	if (typeof window === "undefined") return DEFAULT_LOCALE;

	const stored = browserStorage()?.getItem(STORAGE_KEY);
	if (isPortalLocale(stored)) return stored;
	if (memoryLocale) return memoryLocale;

	return localeFromBrowser();
}

export function saveLocale(locale: PortalLocale): void {
	memoryLocale = locale;
	try {
		browserStorage()?.setItem(STORAGE_KEY, locale);
	} catch {
		/* storage unavailable — the in-memory copy above still holds */
	}
}

/**
 * Forget the local copy on sign-out, so a shared machine does not hand the next
 * person the previous one's language before their own preference loads.
 */
export function clearLocale(): void {
	memoryLocale = null;
	try {
		browserStorage()?.removeItem(STORAGE_KEY);
	} catch {
		/* storage unavailable */
	}
}

/** The `lang` attribute for `<html>`. Screen readers and browser translation read it. */
export function htmlLangFor(locale: PortalLocale): string {
	return locale === "zh" ? "zh-Hans" : "en";
}

/** Normalise whatever `/auth/me` returned in `preferredLocale`. */
export function localeFromProfile(
	raw: string | null | undefined,
): PortalLocale | null {
	if (isPortalLocale(raw)) return raw;
	return localeFromTag(raw);
}
