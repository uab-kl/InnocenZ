import { redirect } from "@tanstack/react-router";
import { clearAuthTokens, getAccessToken } from "@/lib/auth/auth-storage";
import { readTabScoped } from "@/lib/auth/tab-scoped-storage";
import { pickHomePortal } from "@/lib/auth/pick-home-portal";
import { getClient } from "@/lib/axios-v1";
import { hardNavigate } from "@/lib/hard-navigate";
import { deLocalizeHref } from "@/paraglide/runtime";

/** Keep in sync with agency-demo-session (avoid importing it — circular). */
const AGENCY_DEMO_EMAIL = "demo@atlas-agency.invalid";
const OUTLET_DEMO_EMAIL = "demo@velvet23.invalid";
const SESSION_KIND_KEY = "iz-session-kind";

/**
 * THIS TAB's session kind — via the same per-tab pin the tokens use, never
 * the shared localStorage seed. The shared read was the last jump vector
 * left: a DEMO tab beside a fresh REAL login read the other tab's "real",
 * skipped the demo-portal path, sent its unsigned demo token to /auth/me and
 * got bounced to login — "suddenly signed out" by an action in another tab.
 * (tab-scoped-storage is a leaf module; the circular-import concern above is
 * about agency-demo-session itself, not this.)
 */
function sessionKind(): string | null {
	return readTabScoped(SESSION_KIND_KEY);
}

/**
 * The path the visitor actually asked for, to hand to /login as `next`.
 *
 * Without it a deep link is simply lost: opening `/en/admin/dashboard` in a
 * browser with no session bounced to /login and then on to whatever portal home
 * the account defaults to — so an ADMIN link opened in a second browser landed
 * on the agency console, which reads as the role having changed by itself.
 *
 * Locale prefix stripped, because the router matches de-localized paths.
 */
function attemptedPath(): string | undefined {
	try {
		const path = deLocalizeHref(
			window.location.pathname + window.location.search,
		);
		// Same-origin app paths only. A value starting "//" or a full URL would
		// turn this into an open redirect that bounces the visitor off-site.
		if (!path.startsWith("/") || path.startsWith("//")) return undefined;
		if (path === "/login" || path.startsWith("/login?")) return undefined;
		return path;
	} catch {
		return undefined;
	}
}

/** `/login` with the attempted path attached, for hard navigations. */
function loginHrefWithNext(): string {
	const next = attemptedPath();
	return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

export function ensureAuthenticated() {
	if (typeof window === "undefined") return;

	if (!getAccessToken()) {
		clearAuthTokens();
		const next = attemptedPath();
		throw redirect({ to: "/login", search: next ? { next } : {} });
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

/**
 * Where to send a signed-in visitor who opened a link for a portal their account
 * does not hold — a link copied from someone else's browser, or from their own
 * other account.
 *
 * NOT `homePath`. Silently relocating them to their own portal is what reads as
 * "the role changed by itself": the address bar shows a page they did not ask
 * for and nothing says why. This carries the attempted link and the portal it
 * needs, so /no-access can name both and offer a sign-out.
 */
function wrongPortalSearch(portal: PortalCode): {
	needs: PortalCode;
	link?: string;
} {
	const link = attemptedPath();
	return link ? { needs: portal, link } : { needs: portal };
}

/** Same destination as a raw href, for hardNavigate (which takes a string). */
function wrongPortalHref(portal: PortalCode): string {
	const s = wrongPortalSearch(portal);
	const q = new URLSearchParams({ needs: s.needs });
	if (s.link) q.set("link", s.link);
	return `/no-access?${q.toString()}`;
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
	const { portals } = await signedInPortals();
	if (portals.includes(portal)) return;

	throw redirect({ to: "/no-access", search: wrongPortalSearch(portal) });
}

/** Admin tree: canonical `admin` role only. Demo sessions never qualify. */
export async function ensureAdminPortal() {
	if (typeof window === "undefined") return;
	ensureAuthenticated();
	if (demoPortal()) {
		const { portals, names } = await signedInPortals();
		throw redirect({ to: homePath(portals, names) });
	}
	const { names } = await signedInPortals();
	if (names.some((n) => n === "admin")) return;
	throw redirect({ to: "/no-access", search: wrongPortalSearch("admin") });
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
		hardNavigate(loginHrefWithNext());
		return false;
	}
	try {
		const { portals, names } = await signedInPortals();
		if (portal === "admin") {
			if (names.some((n) => n === "admin") && !demoPortal()) return true;
		} else if (portals.includes(portal)) {
			return true;
		}
		hardNavigate(wrongPortalHref(portal));
		return false;
	} catch {
		clearPortalCache();
		clearAuthTokens();
		hardNavigate(loginHrefWithNext());
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
	hardNavigate(loginHrefWithNext());
}
