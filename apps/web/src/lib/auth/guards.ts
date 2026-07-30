import { redirect } from "@tanstack/react-router";
import { clearAuthTokens, getAccessToken } from "@/lib/auth/auth-storage";
import { getClient } from "@/lib/axios-v1";
import { hardNavigate } from "@/lib/hard-navigate";
import { deLocalizeHref } from "@/paraglide/runtime";

export function ensureAuthenticated() {
	if (typeof window === "undefined") return;

	if (!getAccessToken()) {
		clearAuthTokens();
		throw redirect({ to: "/login" });
	}
}

interface MeRole {
	id: string;
	roleName: string;
}

// One /auth/me round-trip per token: the portal gates run on EVERY portal
// navigation, and the roles cannot change without a new login.
let roleCache: { token: string; names: string[] } | null = null;

async function signedInRoleNames(): Promise<string[]> {
	const token = getAccessToken() as string;
	if (roleCache?.token === token) return roleCache.names;
	let roles: MeRole[];
	try {
		const res = await getClient(kickToLogin).get<{
			data?: { roles?: MeRole[] };
		}>("/auth/me");
		roles = res.data?.data?.roles ?? [];
	} catch {
		clearAuthTokens();
		throw redirect({ to: "/login" });
	}
	const names = roles.map((r) => (r.roleName ?? "").toLowerCase());
	roleCache = { token, names };
	return names;
}

/**
 * Each portal tree is for its own role ONLY (TEST_SCRIPT §4d): /admin needs
 * the admin role, /agency the agency role, /outlet the outlet role. Any other
 * authenticated session is sent to the portal its own role owns (a PR token
 * lands on /no-access) instead of browsing a foreign shell against 403s.
 * Matches on the seeded role NAMES only (admin|agency|outlet|pr) — the old
 * VITE_*_ROLE_ID fallbacks go stale whenever RBAC is reseeded and then
 * misroute real sessions (an admin was bounced to /agency by exactly that).
 * A failed role lookup kicks to /login (fail closed).
 */
export async function ensurePortal(portal: "admin" | "agency" | "outlet") {
	if (typeof window === "undefined") return;
	ensureAuthenticated();
	const names = await signedInRoleNames();
	if (names.includes(portal)) return;
	if (names.includes("admin")) throw redirect({ to: "/admin" });
	if (names.includes("agency")) throw redirect({ to: "/agency" });
	if (names.includes("outlet")) throw redirect({ to: "/outlet" });
	console.warn("[portal-gate] session has no portal role:", names);
	throw redirect({ to: "/no-access" });
}

export const ensureAdminPortal = () => ensurePortal("admin");

export function kickToLogin() {
	clearAuthTokens();
	if (typeof window === "undefined") return;

	// Both halves have to account for the locale prefix: the live pathname is
	// `/en/login`, so comparing it to '/login' never matched and the guard
	// re-assigned the location even when already on the login screen.
	if (deLocalizeHref(window.location.pathname) !== "/login") {
		hardNavigate("/login");
	}
}
