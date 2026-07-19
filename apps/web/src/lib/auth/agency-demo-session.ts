import type { AgencySessionIdentity } from "@agency-portal/lib/agency-identity";
import type { OutletSessionIdentity } from "@agency-portal/lib/outlet-identity";
import { saveAuthTokens } from "@/lib/auth/auth-storage";
import { kickToLogin } from "@/lib/auth/guards";

/** Demo account that unlocks the ported agency portal (proto demo data). */
export const AGENCY_DEMO_EMAIL = "owner@atlas-agency.my";
export const AGENCY_DEMO_PASSWORD = "password";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_KIND_KEY = "iz-session-kind";
export type PortalSessionKind = "demo" | "real";

/** Persist how the current portal session was authenticated. */
export function setPortalSessionKind(kind: PortalSessionKind): void {
	try {
		localStorage.setItem(SESSION_KIND_KEY, kind);
	} catch {
		// localStorage unavailable (SSR / privacy mode) — nothing to persist.
	}
}

/**
 * Read the current portal session kind. `real` accounts render the portal with
 * blank data; `demo` (or unset, for legacy sessions) keeps the seeded demo data.
 */
export function getPortalSessionKind(): PortalSessionKind | null {
	try {
		return localStorage.getItem(SESSION_KIND_KEY) as PortalSessionKind | null;
	} catch {
		return null;
	}
}

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
	return `${header}.${payload}.demo`;
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

/** Demo account that unlocks the ported outlet portal (proto demo data). */
export const OUTLET_DEMO_EMAIL = "owner@velvet23.my";

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
}): Promise<void> {
	setPortalSessionKind("real");
	const normalized = profile.email.trim().toLowerCase();
	const [{ useStore }, { buildBlankPortalReset }, identityLib, agencySvc] =
		await Promise.all([
			import("@agency-portal/lib/store"),
			import("@agency-portal/lib/demo-seed"),
			import("@agency-portal/lib/agency-identity"),
			import("@/services/agency"),
		]);

	let identity: AgencySessionIdentity | null = null;
	try {
		const res = await agencySvc.fetchAgencyMembershipsForUser(
			profile.id,
			kickToLogin,
		);
		const primary = identityLib.pickPrimaryMembership(res.data);
		if (primary) identity = identityLib.identityFromMembership(primary);
	} catch {
		identity = null;
	}

	const store = useStore.getState();
	store.signIn(profile.displayName || normalized, normalized);
	store.setRole("agency");
	useStore.setState(buildBlankPortalReset());

	if (identity) {
		const resolved = identity;
		identityLib.saveAgencyIdentity(resolved);
		store.setAgencySubRole(resolved.subRole);
		useStore.setState((st) => ({
			activeAgencyId: resolved.agencyId,
			agencyOwner: {
				...st.agencyOwner,
				orgName: resolved.orgName,
				email: normalized,
			},
		}));
	} else {
		identityLib.clearAgencyIdentity();
		store.setAgencySubRole("agency_owner");
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
}): Promise<void> {
	setPortalSessionKind("real");
	const normalized = profile.email.trim().toLowerCase();
	const [{ useStore }, { buildBlankPortalReset }, identityLib, outletSvc] =
		await Promise.all([
			import("@agency-portal/lib/store"),
			import("@agency-portal/lib/demo-seed"),
			import("@agency-portal/lib/outlet-identity"),
			import("@/services/outlet"),
		]);

	let identity: OutletSessionIdentity | null = null;
	try {
		const res = await outletSvc.fetchOutletMembershipsForUser(
			profile.id,
			kickToLogin,
		);
		const primary = identityLib.pickPrimaryMembership(res.data);
		if (primary) identity = identityLib.identityFromMembership(primary);
	} catch {
		identity = null;
	}

	const store = useStore.getState();
	store.signIn(profile.displayName || normalized, normalized);
	store.setRole("vendor");
	useStore.setState(buildBlankPortalReset());

	if (identity) {
		const resolved = identity;
		identityLib.saveOutletIdentity(resolved);
		store.setOutletSubRole(resolved.subRole);
		useStore.setState((st) => ({
			outletOwner: {
				...st.outletOwner,
				orgName: resolved.outletName,
				email: normalized,
			},
			outletWorkspace: {
				...st.outletWorkspace,
				outletName: resolved.outletName,
			},
		}));
	} else {
		identityLib.clearOutletIdentity();
		store.setOutletSubRole("outlet_owner");
	}
}
