/** Auto back targets for portal sub-routes */

const PORTAL_HUBS = ["/agency", "/outlet", "/host"] as const;

/** Agency bottom-nav tabs — back exits to role picker */
const AGENCY_MAIN_TABS = [
	"/agency",
	"/agency/roster",
	"/agency/pv",
	"/agency/history",
] as const;

export type PortalHub = (typeof PORTAL_HUBS)[number];

/** Role-picker screen — exiting a portal returns here */
export const WELCOME_PATH = "/" as const;

/** Bottom-nav outlet tabs — back exits to role picker */
const OUTLET_MAIN_TABS = [
	"/outlet",
	"/outlet/bookings",
	"/outlet/history",
	"/outlet/calendar",
	"/outlet/ratings",
	"/outlet/billing",
] as const;

function normalizePath(pathname: string) {
	return pathname.replace(/\/$/, "") || "/";
}

export function isOutletMainTab(pathname: string): boolean {
	const norm = normalizePath(pathname);
	return OUTLET_MAIN_TABS.some((t) => norm === t);
}

export function isAgencyMainTab(pathname: string): boolean {
	const norm = normalizePath(pathname);
	return AGENCY_MAIN_TABS.some((t) => norm === t);
}

export function getPortalHub(pathname: string): PortalHub | null {
	if (pathname.startsWith("/agency")) return "/agency";
	if (pathname.startsWith("/outlet")) return "/outlet";
	if (pathname.startsWith("/host")) return "/host";
	return null;
}

export function isPortalHub(pathname: string): boolean {
	const hub = getPortalHub(pathname);
	if (!hub) return false;
	const norm = normalizePath(pathname);
	return norm === hub;
}

/** Default back route: sub-page → portal hub, hub → role picker */
export function getAutoBackTo(pathname: string): string | undefined {
	if (pathname.startsWith("/signin")) return WELCOME_PATH;
	const norm = normalizePath(pathname);
	if (norm === WELCOME_PATH) return undefined;
	if (pathname.startsWith("/outlet") && isOutletMainTab(pathname))
		return WELCOME_PATH;
	if (pathname.startsWith("/agency") && isAgencyMainTab(pathname))
		return WELCOME_PATH;
	const hub = getPortalHub(pathname);
	if (!hub) return WELCOME_PATH;
	if (isPortalHub(pathname)) return WELCOME_PATH;
	return hub;
}

export function getAutoBackLabel(pathname: string): string {
	if (pathname.startsWith("/signin")) return "Welcome";
	if (pathname.startsWith("/outlet") && isOutletMainTab(pathname))
		return "Welcome";
	if (pathname.startsWith("/agency") && isAgencyMainTab(pathname))
		return "Welcome";
	const hub = getPortalHub(pathname);
	if (!hub || isPortalHub(pathname)) return "Welcome";
	if (hub === "/agency") return "Agency home";
	if (hub === "/outlet") return "Outlet home";
	return "PR home";
}
