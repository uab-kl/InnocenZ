import type { AgencySessionIdentity } from "@agency-portal/lib/agency-identity";
import { AGENCY_LEAST_PRIVILEGE } from "@agency-portal/lib/agency-rbac";
import type { OutletSessionIdentity } from "@agency-portal/lib/outlet-identity";
import { OUTLET_LEAST_PRIVILEGE } from "@agency-portal/lib/outlet-rbac";
import {
	resolveAgencyIdentityForUser,
	resolveOutletIdentityForUser,
} from "@agency-portal/lib/resolve-session-identity";
import { getAccessToken, saveAuthTokens } from "@/lib/auth/auth-storage";
import { readTabScoped, writeTabScoped } from "@/lib/auth/tab-scoped-storage";

/**
 * Demo account that unlocks the ported agency portal (proto demo data).
 *
 * This MUST NOT be an address a real operator can hold. It used to be
 * `owner@atlas-agency.my` — the real seeded owner login — so one email forked
 * on the password: `Password123!` reached the backend, while `password` matched
 * here and short-circuited into a fake-JWT demo session that was
 * indistinguishable on screen. A mistyped password therefore looked like a
 * successful login into a parallel app full of fixtures. `.invalid` is reserved
 * by RFC 2606 and can never be registered, so the collision is now structurally
 * impossible rather than merely unlikely.
 */
export const AGENCY_DEMO_EMAIL = "demo@atlas-agency.invalid";
export const AGENCY_DEMO_PASSWORD = "password";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_KIND_KEY = "iz-session-kind";
export type PortalSessionKind = "demo" | "real";

/**
 * Persist how the current portal session was authenticated.
 *
 * PER-TAB. Shared, a demo sign-in in any tab flipped every other tab's session
 * kind — and `real` is what makes the portal blank the demo seed, so that flip
 * put demo data on a real operator's screen.
 */
export function setPortalSessionKind(kind: PortalSessionKind): void {
	writeTabScoped(SESSION_KIND_KEY, kind);
}

/**
 * Read the current portal session kind. `real` accounts render the portal with
 * blank data; `demo` (or unset, for legacy sessions) keeps the seeded demo data.
 */
export function getPortalSessionKind(): PortalSessionKind | null {
	return readTabScoped(SESSION_KIND_KEY) as PortalSessionKind | null;
}

/** The signature segment of the unsigned demo token below. */
const DEMO_JWT_SIGNATURE = "demo";

/**
 * Build a placeholder access token whose payload mirrors the backend shape
 * (`loginMethod` / `loginCriteria`) so anything that decodes it keeps working.
 * This is NOT a verified token — demo portals run entirely on client-side demo
 * data and never call the real backend.
 */
function makeDemoJwt(email: string): string {
	const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
	const payload = btoa(
		JSON.stringify({ loginMethod: "email", loginCriteria: email }),
	);
	return `${header}.${payload}.${DEMO_JWT_SIGNATURE}`;
}

/**
 * MAY THIS TAB SKIP THE SERVER FOR AN ACCOUNT ACTION? Only when there is no
 * account behind it.
 *
 * ⚠️ Deliberately NOT `getPortalSessionKind() !== "real"`. That reading counts
 * an UNSET marker as demo — right for choosing which DATA to paint (see
 * PortalShell), wrong for a security action: a real token whose tab has no
 * marker was shown "Password updated" while nothing was sent. So an unset
 * marker is decided by the token itself — only the unsigned demo token minted
 * above is a demo. Anything else goes to the server, which has the last word.
 */
export function isDemoPortalSession(): boolean {
	const kind = getPortalSessionKind();
	if (kind === "demo") return true;
	if (kind === "real") return false;
	return getAccessToken()?.split(".")[2] === DEMO_JWT_SIGNATURE;
}

export function isAgencyDemoLogin(email: string, password: string): boolean {
	return (
		email.trim().toLowerCase() === AGENCY_DEMO_EMAIL &&
		password === AGENCY_DEMO_PASSWORD
	);
}

/**
 * Start a local demo session for the agency portal: save placeholder auth
 * tokens (so the `/agency` route guard passes) and seed the proto store as the
 * Atlas agency owner. Client-only — the store is imported dynamically so it
 * never loads during SSR or on the login bundle.
 */
export async function startAgencyDemoSession(email: string): Promise<void> {
	setPortalSessionKind("demo");
	const normalized = email.trim().toLowerCase();
	const token = makeDemoJwt(normalized);
	saveAuthTokens(token, token, Date.now() + SEVEN_DAYS_MS);

	const { useStore } = await import("@agency-portal/lib/store");
	const store = useStore.getState();
	store.signIn("Atlas Agency", normalized);
	store.setRole("agency");
	store.setAgencySubRole("agency_owner");
}

/** Demo account that unlocks the ported outlet portal — see AGENCY_DEMO_EMAIL. */
export const OUTLET_DEMO_EMAIL = "demo@velvet23.invalid";

export function isOutletDemoLogin(email: string, password: string): boolean {
	return (
		email.trim().toLowerCase() === OUTLET_DEMO_EMAIL &&
		password === AGENCY_DEMO_PASSWORD
	);
}

/**
 * Start a local demo session for the outlet portal: placeholder tokens + seed
 * the proto store as the Velvet 23 outlet owner. Client-only (the store is
 * imported dynamically so it never loads during SSR or on the login bundle).
 */
export async function startOutletDemoSession(email: string): Promise<void> {
	setPortalSessionKind("demo");
	const normalized = email.trim().toLowerCase();
	const token = makeDemoJwt(normalized);
	saveAuthTokens(token, token, Date.now() + SEVEN_DAYS_MS);

	const { useStore } = await import("@agency-portal/lib/store");
	const store = useStore.getState();
	store.signIn("Velvet 23", normalized);
	store.setRole("vendor");
	store.setOutletSubRole("outlet_owner");
}

/**
 * Start a REAL agency session. The backend `login()` has already saved real
 * tokens; here we resolve the operator's real agency identity + sub-role from
 * their backend membership, seed the client store with it, and blank every demo
 * data slice, then mark the session `real` so the portal layout keeps it blank
 * across reloads. The resolved identity is persisted (localStorage) so the
 * portal shell can re-apply it after each per-mount blank reset. On any
 * resolution failure we fall back to the blank demo identity (owner / full nav)
 * rather than blocking sign-in.
 */
export async function startAgencyRealSession(profile: {
	id: string;
	email: string;
	displayName: string;
	/** `user.username` — owner display name on Settings. */
	username?: string;
}): Promise<void> {
	setPortalSessionKind("real");
	const normalized = profile.email.trim().toLowerCase();
	const [{ useStore }, { buildBlankPortalReset }, identityLib] =
		await Promise.all([
			import("@agency-portal/lib/store"),
			import("@agency-portal/lib/demo-seed"),
			import("@agency-portal/lib/agency-identity"),
		]);

	// Same resolver the portal mount uses, so login and re-derive can never
	// disagree about which membership wins.
	const identity: AgencySessionIdentity | null =
		await resolveAgencyIdentityForUser(profile.id);

	const store = useStore.getState();
	store.signIn(profile.displayName || normalized, normalized);
	store.setRole("agency");
	useStore.setState(buildBlankPortalReset());

	// Drop leftover outlet session so an outlet operator never flashes agency UI
	// from a previous login on this browser.
	const { clearOutletIdentity } = await import(
		"@agency-portal/lib/outlet-identity"
	);
	clearOutletIdentity();

	if (identity) {
		const resolved = identity;
		identityLib.saveAgencyIdentity(resolved);
		store.setAgencySubRole(resolved.subRole);
		const { BLANK_AGENCY_OWNER } = await import(
			"@agency-portal/lib/agency-demo"
		);
		useStore.setState(() => ({
			activeAgencyId: resolved.agencyId,
			agencyOwner: {
				...BLANK_AGENCY_OWNER,
				orgName: resolved.orgName,
				email: normalized,
				ownerName: profile.username || profile.displayName || "",
				accountActivated: resolved.agencyStatus === "active",
			},
		}));
	} else {
		identityLib.clearAgencyIdentity();
		// NOT the owner. A failed resolution means we do not KNOW what this
		// operator is — a cold cache on a new device, a different URL origin, a
		// network blip. Granting the top lane on no evidence is how a Director
		// became an owner just by signing in somewhere else.
		store.setAgencySubRole(AGENCY_LEAST_PRIVILEGE);
	}
}

/**
 * Start a REAL outlet session — same contract as startAgencyRealSession.
 * Resolves the operator's real outlet identity + sub-role from their backend
 * membership, seeds the client store with it, blanks the demo slices, and marks
 * the session `real`. The resolved identity is persisted (localStorage) so the
 * portal shell can re-apply it after each per-mount blank reset. On any
 * resolution failure we fall back to the blank owner identity rather than
 * blocking sign-in.
 */
export async function startOutletRealSession(profile: {
	id: string;
	email: string;
	displayName: string;
	/** `user.username` — owner display name on Settings. */
	username?: string;
}): Promise<void> {
	setPortalSessionKind("real");
	const normalized = profile.email.trim().toLowerCase();
	const [{ useStore }, { buildBlankPortalReset }, identityLib] =
		await Promise.all([
			import("@agency-portal/lib/store"),
			import("@agency-portal/lib/demo-seed"),
			import("@agency-portal/lib/outlet-identity"),
		]);

	// Same resolver the portal mount uses, so login and re-derive can never
	// disagree about which membership wins.
	const identity: OutletSessionIdentity | null =
		await resolveOutletIdentityForUser(profile.id);

	const store = useStore.getState();
	store.signIn(profile.displayName || normalized, normalized);
	store.setRole("vendor");
	useStore.setState(buildBlankPortalReset());

	const { clearAgencyIdentity } = await import(
		"@agency-portal/lib/agency-identity"
	);
	clearAgencyIdentity();

	if (identity) {
		const resolved = identity;
		identityLib.saveOutletIdentity(resolved);
		store.setOutletSubRole(resolved.subRole);
		const { BLANK_OUTLET_OWNER } = await import(
			"@agency-portal/lib/outlet-demo"
		);
		useStore.setState((st) => ({
			outletOwner: {
				...BLANK_OUTLET_OWNER,
				orgName: resolved.outletName,
				email: normalized,
				// `profile.displayName` is mapped from `user.username` in fetchProfile.
				ownerName: profile.username || profile.displayName || "",
				mobile: "",
				accountActivated: resolved.outletStatus === "active",
			},
			outletWorkspace: {
				...st.outletWorkspace,
				outletName: resolved.outletName,
			},
		}));
	} else {
		identityLib.clearOutletIdentity();
		// NOT the owner — same reason as the agency path above.
		store.setOutletSubRole(OUTLET_LEAST_PRIVILEGE);
	}
}
