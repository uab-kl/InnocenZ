import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * InnocenZ is DARK ONLY (owner, 7 Oct 2026: "make sure there is no light
 * mode"). `forcedTheme` pins every page: the device's light/dark setting and
 * any `theme` a past header toggle stored in this browser are both ignored.
 * `__root.tsx` also renders `<html class="dark">`, so the first paint is dark
 * before next-themes' script runs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="dark"
			forcedTheme="dark"
			enableSystem={false}
		>
			{children}
		</NextThemesProvider>
	);
}
