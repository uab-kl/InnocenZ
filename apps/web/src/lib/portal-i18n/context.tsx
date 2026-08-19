import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getAccessToken } from "@/lib/auth/auth-storage";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient } from "@/lib/axios-v1";
import {
	DEFAULT_LOCALE,
	htmlLangFor,
	loadLocale,
	localeFromProfile,
	type PortalLocale,
	saveLocale,
} from "./locale-prefs";
import { type PortalTranslations, translations } from "./translations";

type PortalLocaleContextValue = {
	locale: PortalLocale;
	t: PortalTranslations;
	setLocale: (locale: PortalLocale) => void;
};

/**
 * A DEFAULT value rather than `null`.
 *
 * `useLandingLocale` throws when used outside its provider, and that is right
 * for the marketing pages — one tree, one provider at the root. The portals are
 * not: this dictionary is being adopted screen by screen over several passes,
 * and portal components also render from the admin tree, which mounts its own
 * shell. A hook that throws would turn "this screen is not translated yet" into
 * a white screen.
 *
 * So an un-provided consumer renders English and no-ops on `setLocale` — which
 * is exactly what every untranslated screen does today.
 */
const FALLBACK: PortalLocaleContextValue = {
	locale: DEFAULT_LOCALE,
	t: translations[DEFAULT_LOCALE],
	setLocale: () => {},
};

const PortalLocaleContext = createContext<PortalLocaleContextValue>(FALLBACK);

/** Fire-and-forget: a failed save must never block the UI from switching. */
async function persistLocaleToAccount(locale: PortalLocale): Promise<void> {
	if (!getAccessToken()) return;
	try {
		// `kickToLogin` for the same reason every other caller passes it:
		// getClient memoises the instance on FIRST call, so a no-op handed in
		// here would become the refresh-failure behaviour for the whole app.
		await getClient(kickToLogin).patch("/auth/me/locale", { locale });
	} catch {
		// The local copy already holds, so the pick survives in this browser even
		// when the account-level save fails. Deliberately silent: this fires on
		// every switch, and a toast here would shout at someone whose only crime
		// was changing language while offline.
	}
}

export function PortalLocaleProvider({
	children,
	/**
	 * `user.preferred_locale` from `/auth/me`. Undefined while the profile is
	 * still loading — which is why it hydrates in an effect rather than seeding
	 * initial state.
	 */
	accountLocale,
}: {
	children: ReactNode;
	accountLocale?: string | null;
}) {
	// Starts at the SSR-safe default; the stored value lands in the effect below.
	// Reading localStorage in a useState initialiser would render a different
	// tree on the client than the server sent — the hydration mismatch that
	// `lib/landing-i18n` still carries.
	const [locale, setLocaleState] = useState<PortalLocale>(DEFAULT_LOCALE);

	useEffect(() => {
		setLocaleState(loadLocale());
	}, []);

	// The account's saved language wins over this browser's copy, but only ONCE
	// per mount — otherwise a profile refetch would yank the language back
	// mid-session and undo a switch the user just made.
	const accountApplied = useRef(false);
	useEffect(() => {
		if (accountApplied.current) return;
		const fromAccount = localeFromProfile(accountLocale);
		if (!fromAccount) return;
		accountApplied.current = true;
		setLocaleState(fromAccount);
		saveLocale(fromAccount);
	}, [accountLocale]);

	useEffect(() => {
		if (typeof document === "undefined") return;
		document.documentElement.lang = htmlLangFor(locale);
	}, [locale]);

	const setLocale = useCallback((next: PortalLocale) => {
		// A manual pick is the user's final word for this session: mark the
		// account hydration spent so a late profile response cannot overwrite it.
		accountApplied.current = true;
		setLocaleState(next);
		saveLocale(next);
		void persistLocaleToAccount(next);
	}, []);

	const value = useMemo(
		() => ({ locale, t: translations[locale], setLocale }),
		[locale, setLocale],
	);

	return (
		<PortalLocaleContext.Provider value={value}>
			{children}
		</PortalLocaleContext.Provider>
	);
}

export function usePortalLocale(): PortalLocaleContextValue {
	return useContext(PortalLocaleContext);
}
