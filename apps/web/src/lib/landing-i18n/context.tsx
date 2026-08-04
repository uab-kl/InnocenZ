import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	type LandingLocale,
	type LandingTranslations,
	translations,
} from "./translations";

const STORAGE_KEY = "innocenz-landing-locale";

interface LandingLocaleContextValue {
	locale: LandingLocale;
	t: LandingTranslations;
	setLocale: (locale: LandingLocale) => void;
}

const LandingLocaleContext = createContext<LandingLocaleContextValue | null>(
	null,
);

function readStoredLocale(): LandingLocale {
	if (typeof window === "undefined") return "en";
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === "zh" ? "zh" : "en";
}

export function LandingLocaleProvider({
	children,
	documentTitle,
}: {
	children: ReactNode;
	documentTitle?: (t: LandingTranslations) => string;
}) {
	const [locale, setLocaleState] = useState<LandingLocale>(readStoredLocale);

	const setLocale = useCallback((next: LandingLocale) => {
		setLocaleState(next);
		localStorage.setItem(STORAGE_KEY, next);
	}, []);

	const t = translations[locale];

	useEffect(() => {
		document.documentElement.lang = locale === "zh" ? "zh-Hans-CN" : "en";
		document.title = documentTitle?.(t) ?? t.meta.title;
	}, [locale, t, documentTitle]);

	const value = useMemo(
		() => ({ locale, t, setLocale }),
		[locale, t, setLocale],
	);

	return (
		<LandingLocaleContext.Provider value={value}>
			{children}
		</LandingLocaleContext.Provider>
	);
}

export function useLandingLocale() {
	const ctx = useContext(LandingLocaleContext);
	if (!ctx) {
		throw new Error(
			"useLandingLocale must be used within LandingLocaleProvider",
		);
	}
	return ctx;
}
