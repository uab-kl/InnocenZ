import { redirect } from "@tanstack/react-router";
import { env } from "@/env";
import { clearAuthTokens, getAccessToken } from "@/lib/auth/auth-storage";
import { pickHomePortal } from "@/lib/auth/pick-home-portal";
import { readTabScoped } from "@/lib/auth/tab-scoped-storage";
import { fetchWithSession, isSessionRefusal } from "@/lib/auth/token-refresh";
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

/**
 * What `/auth/me` said about this tab's session — three answers, kept apart.
 *
 * ⚠️ `unavailable` IS NOT `session-over` (28 Sep 2026 follow-up). This used to
 * sign the tab out on ANY failure of `/auth/me` — a 429 from the refresh
 * limiter, a 5xx, being offline for a moment — which is what cleared people's
 * browser sessions on 28 Sep. Only a session REFUSAL ends it: the refresh was
 * refused, or the fresh token was refused too (`fetchWithSession` refreshes
 * and replays once). Anything else could not be decided, and a session that is
 * not known to be over is not ended.
 */
type PortalAnswer =
	| { kind: "ok"; portals: PortalCode[]; names: string[] }
	| { kind: "session-over" }
	| { kind: "unavailable" };

async function readSignedInPortals(): Promise<PortalAnswer> {
	const demo = demoPortal();
	if (demo) {
		return { kind: "ok", portals: [demo], names: [demo] };
	}

	const token = getAccessToken() as string;
	if (portalCache?.token === token) {
		return {
			kind: "ok",
			portals: portalCache.portals,
			names: portalCache.names,
		};
	}
	let response: Response;
	try {
		response = await fetchWithSession(`${env.VITE_API_URL}/v1/auth/me`);
	} catch {
		// Offline, or a refresh that could not be decided (RefreshUnavailableError).
		return { kind: "unavailable" };
	}
	if (isSessionRefusal(response.status, "/auth/me")) {
		return { kind: "session-over" };
	}
	if (!response.ok) return { kind: "unavailable" };
	let body: { data?: { roles?: MeRole[]; portals?: string[] } } | null;
	try {
		body = await response.json();
	} catch {
		return { kind: "unavailable" };
	}
	const roles = body?.data?.roles ?? [];
	const portalsFromApi = body?.data?.portals ?? [];
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
	// Keyed on the token held NOW — a refresh on the way replaced the old one.
	portalCache = { token: getAccessToken() ?? token, portals: gated, names };
	return { kind: "ok", portals: gated, names };
}

/** A session that is over leaves no token, no cached answer and no chosen org. */
function endSession(): void {
	clearPortalCache();
	clearAuthTokens();
}

/**
 * For the route gates (`beforeLoad`): the portals, or `null` when `/auth/me`
 * could not be reached — in which case the gate lets the navigation proceed,
 * and the layout's `guardPortalClient` holds its splash until it can decide.
 * Nothing renders on an undecided answer, and nobody is signed out by one.
 */
async function portalsForGate(): Promise<{
	portals: PortalCode[];
	names: string[];
} | null> {
	const answer = await readSignedInPortals();
	if (answer.kind === "ok") return answer;
	if (answer.kind === "unavailable") return null;
	endSession();
	const next = attemptedPath();
	throw redirect({ to: "/login", search: next ? { next } : {} });
}

/**
 * How long `guardPortalClient` waits between asks while `/auth/me` cannot be
 * reached — about half a minute in all, then it stops asking and leaves the
 * splash up (and the person signed in) rather than guess.
 */
const GATE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
	const answer = await portalsForGate();
	if (!answer || answer.portals.includes(portal)) return;

	throw redirect({ to: "/no-access", search: wrongPortalSearch(portal) });
}

/** Admin tree: canonical `admin` role only. Demo sessions never qualify. */
export async function ensureAdminPortal() {
	if (typeof window === "undefined") return;
	ensureAuthenticated();
	if (demoPortal()) {
		// A demo session never asks `/auth/me`, so this is always decided.
		const answer = await portalsForGate();
		throw redirect({
			to: answer ? homePath(answer.portals, answer.names) : "/no-access",
		});
	}
	const answer = await portalsForGate();
	if (!answer || answer.names.some((n) => n === "admin")) return;
	throw redirect({ to: "/no-access", search: wrongPortalSearch("admin") });
}

/**
 * Client-side portal check for layouts (SSR cannot read sessionStorage).
 * Returns true when access is allowed; otherwise hard-navigates away — to
 * /login ONLY when the session is over.
 *
 * While `/auth/me` cannot be reached it asks again (`GATE_RETRY_DELAYS_MS`),
 * keeping the layout on its splash, and finally returns false WITHOUT
 * signing anybody out. A navigation decided late is dropped if the person has
 * moved on meanwhile, so a slow answer cannot pull them off another page.
 */
export async function guardPortalClient(
	portal: PortalCode | "admin",
): Promise<boolean> {
	if (typeof window === "undefined") return false;
	if (!getAccessToken()) {
		endSession();
		hardNavigate(loginHrefWithNext());
		return false;
	}
	const startedOn = window.location.pathname;
	for (let attempt = 0; ; attempt += 1) {
		const answer = await readSignedInPortals();
		const stillHere = window.location.pathname === startedOn;
		if (answer.kind === "session-over") {
			endSession();
			if (stillHere) hardNavigate(loginHrefWithNext());
			return false;
		}
		if (answer.kind === "ok") {
			if (portal === "admin") {
				if (answer.names.some((n) => n === "admin") && !demoPortal()) {
					return true;
				}
			} else if (answer.portals.includes(portal)) {
				return true;
			}
			if (stillHere) hardNavigate(wrongPortalHref(portal));
			return false;
		}
		const delay = GATE_RETRY_DELAYS_MS[attempt];
		if (delay === undefined || !stillHere) return false;
		await sleep(delay);
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
