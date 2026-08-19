import { redirect } from "@tanstack/react-router";
import { clearAuthTokens, getAccessToken } from "@/lib/auth/auth-storage";
import { pickHomePortal } from "@/lib/auth/pick-home-portal";
import { getClient } from "@/lib/axios-v1";
import { hardNavigate } from "@/lib/hard-navigate";
import { deLocalizeHref } from "@/paraglide/runtime";

/** Keep in sync with agency-demo-session (avoid importing it — circular). */
const AGENCY_DEMO_EMAIL = "demo@atlas-agency.invalid";
const OUTLET_DEMO_EMAIL = "demo@velvet23.invalid";
const SESSION_KIND_KEY = "iz-session-kind";

function sessionKind(): string | null {
	try {
		return localStorage.getItem(SESSION_KIND_KEY);
	} catch {
		return null;
	}
}

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
	portalCode?: string | null;
}

type PortalCode = "admin" | "agency" | "outlet";

let portalCache: {
	token: string;
	portals: PortalCode[];
	names: string[];
} | null = null;

export function clearPortalCache() {
	portalCache = null;
}

function portalFromRoleName(name: string): PortalCode | null {
	const n = name.toLowerCase().trim();
	// Admin is exact only — never treat "admin_*" custom names as the master portal.
	if (n === "admin") return "admin";
	if (n === "agency" || n.startsWith("agency_") || n.startsWith("agency ")) {
		return "agency";
	}
	if (n === "outlet" || n.startsWith("outlet_") || n.startsWith("outlet ")) {
		return "outlet";
	}
	return null;
}

/** Demo JWTs are unsigned and never hit `/auth/me` — resolve portal from the email. */
function demoPortal(): PortalCode | null {
	if (sessionKind() !== "demo") return null;
	const token = getAccessToken();
	if (!token) return null;
	try {
		const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as {
			loginCriteria?: string;
		};
		const email = String(payload.loginCriteria ?? "")
			.trim()
			.toLowerCase();
		if (email === AGENCY_DEMO_EMAIL) return "agency";
		if (email === OUTLET_DEMO_EMAIL) return "outlet";
	} catch {
		return null;
	}
	return null;
}

async function signedInPortals(): Promise<{
	portals: PortalCode[];
	names: string[];
}> {
	const demo = demoPortal();
	if (demo) {
		return { portals: [demo], names: [demo] };
	}

	const token = getAccessToken() as string;
	if (portalCache?.token === token) {
		return { portals: portalCache.portals, names: portalCache.names };
	}
	let roles: MeRole[] = [];
	let portalsFromApi: string[] = [];
	try {
		const res = await getClient(kickToLogin).get<{
			data?: { roles?: MeRole[]; portals?: string[] };
		}>("/auth/me");
		roles = res.data?.data?.roles ?? [];
		portalsFromApi = res.data?.data?.portals ?? [];
	} catch {
		clearPortalCache();
		clearAuthTokens();
		throw redirect({ to: "/login" });
	}
	const names = roles.map((r) => (r.roleName ?? "").toLowerCase());
	const fromRolePortal = roles
		.map((r) => r.portalCode)
		.filter(
			(p): p is PortalCode => p === "admin" || p === "agency" || p === "outlet",
		);
	const fromRoles = names
		.map(portalFromRoleName)
		.filter((p): p is PortalCode => p != null);
	const fromApi = portalsFromApi.filter(
		(p): p is PortalCode => p === "admin" || p === "agency" || p === "outlet",
	);
	// Prefer portal codes on roles / /auth/me.portals (lane roles like Owner).
	const portals = [...new Set([...fromRolePortal, ...fromApi, ...fromRoles])];
	// Admin portal requires the canonical admin role — never via a stray portalCode.
	const hasAdminRole = names.some((n) => n === "admin");
	const gated = hasAdminRole ? portals : portals.filter((p) => p !== "admin");
	portalCache = { token, portals: gated, names };
	return { portals: gated, names };
}

function homePath(portals: PortalCode[], names: string[]): string {
	const home = pickHomePortal(portals, names);
	if (home === "admin") return "/admin/dashboard";
	if (home === "agency") return "/agency";
	if (home === "outlet") return "/outlet";
	return "/no-access";
}

/**
 * Portal tree gate: user must hold a role belonging to that portal.
 * When both agency + outlet are present, still allow the requested portal
 * (dual-org operators); login already sends them to their primary home.
 *
 * Tokens live in sessionStorage, so SSR cannot authorize. Returning early on
 * the server must NOT be treated as "allowed" — portal layouts re-check on
 * the client via `guardPortalClient`.
 */
export async function ensurePortal(portal: PortalCode) {
	if (typeof window === "undefined") return;
	ensureAuthenticated();
	const { portals, names } = await signedInPortals();
	if (portals.includes(portal)) return;

	throw redirect({ to: homePath(portals, names) });
}

/** Admin tree: canonical `admin` role only. Demo sessions never qualify. */
export async function ensureAdminPortal() {
	if (typeof window === "undefined") return;
	ensureAuthenticated();
	if (demoPortal()) {
		const { portals, names } = await signedInPortals();
		throw redirect({ to: homePath(portals, names) });
	}
	const { portals, names } = await signedInPortals();
	if (names.some((n) => n === "admin")) return;
	throw redirect({ to: homePath(portals, names) });
}

/**
 * Client-side portal check for layouts (SSR cannot read sessionStorage).
 * Returns true when access is allowed; otherwise hard-navigates away.
 */
export async function guardPortalClient(
	portal: PortalCode | "admin",
): Promise<boolean> {
	if (typeof window === "undefined") return false;
	if (!getAccessToken()) {
		clearPortalCache();
		clearAuthTokens();
		hardNavigate("/login");
		return false;
	}
	try {
		const { portals, names } = await signedInPortals();
		if (portal === "admin") {
			if (names.some((n) => n === "admin") && !demoPortal()) return true;
		} else if (portals.includes(portal)) {
			return true;
		}
		hardNavigate(homePath(portals, names));
		return false;
	} catch {
		clearPortalCache();
		clearAuthTokens();
		hardNavigate("/login");
		return false;
	}
}

/** Prevents a 401 storm (e.g. notification poll) from stacking full-page assigns. */
let kickToLoginInFlight = false;

export function kickToLogin() {
	clearPortalCache();
	clearAuthTokens();
	if (typeof window === "undefined") return;

	if (deLocalizeHref(window.location.pathname) === "/login") return;
	if (kickToLoginInFlight) return;
	kickToLoginInFlight = true;
	hardNavigate("/login");
}
