import { saveAuthTokens } from '@/lib/auth/auth-storage';

/** Demo account that unlocks the ported agency portal (proto demo data). */
export const AGENCY_DEMO_EMAIL = 'owner@atlas-agency.my';
export const AGENCY_DEMO_PASSWORD = 'password';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_KIND_KEY = 'iz-session-kind';
export type PortalSessionKind = 'demo' | 'real';

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
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ loginMethod: 'email', loginCriteria: email }),
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
  setPortalSessionKind('demo');
  const normalized = email.trim().toLowerCase();
  const token = makeDemoJwt(normalized);
  saveAuthTokens(token, token, Date.now() + SEVEN_DAYS_MS);

  const { useStore } = await import('@agency-portal/lib/store');
  const store = useStore.getState();
  store.signIn('Atlas Agency', normalized);
  store.setRole('agency');
  store.setAgencySubRole('agency_owner');
}

/** Demo account that unlocks the ported outlet portal (proto demo data). */
export const OUTLET_DEMO_EMAIL = 'owner@velvet23.my';

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
  setPortalSessionKind('demo');
  const normalized = email.trim().toLowerCase();
  const token = makeDemoJwt(normalized);
  saveAuthTokens(token, token, Date.now() + SEVEN_DAYS_MS);

  const { useStore } = await import('@agency-portal/lib/store');
  const store = useStore.getState();
  store.signIn('Velvet 23', normalized);
  store.setRole('vendor');
  store.setOutletSubRole('outlet_owner');
}

/**
 * Start a REAL agency session. The backend `login()` has already saved real
 * tokens; here we only seed the client store's session identity (role +
 * sub-role + display name) and blank every demo data slice, then mark the
 * session `real` so the portal layout keeps it blank across reloads. Wiring the
 * portal to live backend data is a separate task — until then real accounts see
 * the real pages with no rows. Sub-role defaults to owner (full nav) until RBAC
 * is wired to the backend.
 */
export async function startAgencyRealSession(email: string): Promise<void> {
  setPortalSessionKind('real');
  const normalized = email.trim().toLowerCase();
  const [{ useStore }, { buildBlankPortalReset }] = await Promise.all([
    import('@agency-portal/lib/store'),
    import('@agency-portal/lib/demo-seed'),
  ]);
  const store = useStore.getState();
  store.signIn(normalized, normalized);
  store.setRole('agency');
  store.setAgencySubRole('agency_owner');
  useStore.setState(buildBlankPortalReset());
}

/** Start a REAL outlet session — same contract as startAgencyRealSession. */
export async function startOutletRealSession(email: string): Promise<void> {
  setPortalSessionKind('real');
  const normalized = email.trim().toLowerCase();
  const [{ useStore }, { buildBlankPortalReset }] = await Promise.all([
    import('@agency-portal/lib/store'),
    import('@agency-portal/lib/demo-seed'),
  ]);
  const store = useStore.getState();
  store.signIn(normalized, normalized);
  store.setRole('vendor');
  store.setOutletSubRole('outlet_owner');
  useStore.setState(buildBlankPortalReset());
}
