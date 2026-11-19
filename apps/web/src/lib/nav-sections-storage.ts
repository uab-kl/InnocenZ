/**
 * WHERE EACH PORTAL REMEMBERS WHICH SIDE-MENU SECTIONS ARE OPEN — and the one
 * place that forgets them.
 *
 * Owner, 19 Nov 2026: "in default when the user log in to the agency and the
 * outlet, their side panel all close it, just opened the today page" · "admin
 * also just open dashboard". A section someone opens stays open while they
 * work (the hooks save it here), but every SIGN-IN starts from the default —
 * all sections closed except the one holding the current page — so
 * `saveAuthTokens` and `clearAuthTokens` call `resetAllNavSections`.
 *
 * The key names live here once so the hooks and the reset cannot drift apart.
 */
export type NavSectionsPortal = "agency" | "outlet" | "admin";

export function navSectionsKey(portal: NavSectionsPortal): string {
	return `iz-${portal}-navigation-sections`;
}

/** Forget every portal's saved side-menu choice (sign-in and sign-out). */
export function resetAllNavSections(): void {
	try {
		for (const portal of ["agency", "outlet", "admin"] as const) {
			localStorage.removeItem(navSectionsKey(portal));
		}
	} catch {
		/* Storage unavailable (SSR / private mode) — nothing was saved either. */
	}
}
