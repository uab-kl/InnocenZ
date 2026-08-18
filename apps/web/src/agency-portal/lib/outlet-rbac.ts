import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import {
	canModule,
	OUTLET_FEATURE_MODULE,
} from "@/lib/auth/module-permissions";

/** Matches Module 10 outlet columns: Owner, Finance, Ops Head, Director, Guarantor */
export type OutletSubRole =
	| "outlet_owner"
	| "outlet_finance"
	| "outlet_ops"
	| "outlet_director"
	| "outlet_guarantor";

export const OUTLET_SUB_ROLE_LABELS: Record<OutletSubRole, string> = {
	outlet_owner: "Outlet Owner",
	outlet_finance: "Outlet Finance",
	outlet_ops: "Outlet Ops Head",
	outlet_director: "Outlet Director",
	outlet_guarantor: "Outlet Guarantor",
};

type Permission =
	| "postJob"
	/**
	 * SEE the Post Job screen without being able to post.
	 *
	 * Split from `postJob` on 17 Aug 2026 for the Director role, which the owner
	 * asked to keep on that page read-only. One permission cannot express that:
	 * `postJob` is `booking:create`, so gating both the page and its buttons on it
	 * meant a role that could not post could not look either.
	 */
	| "viewBookings"
	| "viewLiveDashboard"
	| "logSales"
	| "sealShift"
	| "confirmShift"
	| "confirmDaily"
	| "viewBilling"
	| "viewSalesDashboard"
	| "ratePrs"
	| "viewHistory"
	| "manageShiftStaffing"
	| "viewWorkspace"
	| "manageWorkspace"
	| "viewSettings"
	| "editSettings"
	| "orderSpecialService"
	/**
	 * Raise a cut-loss request — reducing booked slots on a live shift.
	 *
	 * Mirrors the backend guard on `POST /cutlost`, which admits the owner,
	 * finance and ops lanes but not a Director. Matrix-only on purpose (no
	 * `OUTLET_FEATURE_MODULE` entry): the server gates it by LANE rather than by a
	 * module grant, because outlet Finance holds no `booking` permission at all
	 * and a `booking:create` mapping here would disagree with the server.
	 *
	 * Without this the button rendered for everyone — the component had no
	 * permission check at all — so a Director could click it and collect a 403.
	 */
	| "requestCutLoss";

type ModulePerm = { moduleKey: string; permissionType: string };

const OUTLET_OWNER_PERMISSIONS: Permission[] = [
	"postJob",
	"viewBookings",
	"viewLiveDashboard",
	"logSales",
	"sealShift",
	"confirmShift",
	"confirmDaily",
	"viewBilling",
	"viewSalesDashboard",
	"ratePrs",
	"manageShiftStaffing",
	"viewHistory",
	"viewWorkspace",
	"manageWorkspace",
	"viewSettings",
	"editSettings",
	"orderSpecialService",
	"requestCutLoss",
];

const ROLE_PERMISSIONS: Record<OutletSubRole, Permission[]> = {
	outlet_owner: OUTLET_OWNER_PERMISSIONS,
	/**
	 * The owner's stand-in, at the owner's level — so it SHARES the owner's list
	 * rather than restating it. Two copies is how "same level as the owner" stops
	 * being true the first time one of them is edited, and this role is used
	 * precisely when the owner is not around to notice.
	 */
	outlet_guarantor: OUTLET_OWNER_PERMISSIONS,
	/**
	 * VIEW ONLY. Every screen the owner sees, no write anywhere on the venue.
	 *
	 * `viewSettings` without `editSettings` is what the owner asked for: a
	 * Director reaches Settings, reads it, and edits only its own login and
	 * security — which is not an outlet permission at all (every signed-in user
	 * may change their own password, contact details and MFA), so it needs no
	 * entry here.
	 *
	 * `orderSpecialService` is absent, and that HIDES the nav item and the route
	 * rather than disabling them — the owner's call, since ordering is the only
	 * thing that page does.
	 */
	outlet_director: [
		"viewBookings",
		"viewLiveDashboard",
		"viewBilling",
		"viewSalesDashboard",
		"viewHistory",
		"viewWorkspace",
		"viewSettings",
	],
	outlet_finance: [
		"viewLiveDashboard",
		"viewHistory",
		"confirmDaily",
		"viewBilling",
		"viewSalesDashboard",
		"viewWorkspace",
		"viewSettings",
		"orderSpecialService",
		"requestCutLoss",
	],
	outlet_ops: [
		"postJob",
		"viewBookings",
		"viewLiveDashboard",
		"logSales",
		"sealShift",
		"confirmShift",
		"ratePrs",
		"manageShiftStaffing",
		"viewWorkspace",
		"viewSettings",
		"orderSpecialService",
		"requestCutLoss",
	],
};

/**
 * What an outlet operator is treated as when we do not KNOW what they are.
 *
 * Director — view only. Never the owner. An unresolved role is a question, not
 * a promotion: a real session whose membership has not loaded yet (a fresh
 * device, a different URL origin, a cold cache, a failed fetch) used to be
 * handed the owner's full console until the answer arrived, and stayed there
 * if it never did. Under-privileging for a moment is recoverable; granting the
 * top lane for a moment is not.
 */
export const OUTLET_LEAST_PRIVILEGE: OutletSubRole = "outlet_director";

export function outletCan(
	role: OutletSubRole | null | undefined,
	permission: Permission,
	modulePermissions?: ModulePerm[] | null,
): boolean {
	const r = role ?? OUTLET_LEAST_PRIVILEGE;
	const fallback = ROLE_PERMISSIONS[r].includes(permission);
	if (!modulePermissions?.length) return fallback;

	const outletKeys = new Set(
		Object.values(OUTLET_FEATURE_MODULE).map((m) => m.key),
	);
	const hasOutletGrants = modulePermissions.some((p) =>
		outletKeys.has(p.moduleKey),
	);
	if (!hasOutletGrants) return fallback;

	const map = OUTLET_FEATURE_MODULE[permission];
	if (!map) return fallback;
	return canModule(modulePermissions, map.key, map.type);
}

export type OutletNavItem = {
	to: string;
	label: string;
	icon: LucideIcon;
	permission: Permission;
};

const ALL_NAV: OutletNavItem[] = [
	{
		to: "/outlet",
		label: "Today",
		icon: iconForNav("Today"),
		permission: "viewLiveDashboard",
	},
	{
		to: "/outlet/bookings",
		label: "Post Job",
		icon: iconForNav("Post Job"),
		permission: "postJob",
	},
	{
		to: "/outlet/calendar",
		label: "Calendar page",
		icon: iconForNav("Calendar page"),
		permission: "viewLiveDashboard",
	},
	{
		to: "/outlet/ratings",
		label: "Ratings",
		icon: iconForNav("Ratings"),
		permission: "viewLiveDashboard",
	},
	{
		to: "/outlet/history",
		label: "History",
		icon: iconForNav("History"),
		permission: "viewHistory",
	},
	{
		to: "/outlet/billing",
		label: "Reports",
		icon: iconForNav("Reports"),
		permission: "viewBilling",
	},
];

/** Profile / settings path while the organisation is pending or suspended. */
export const OUTLET_PENDING_PROFILE_PATH = "/outlet/settings";

function isOutletPendingProfilePath(pathname: string): boolean {
	return (
		pathname.startsWith("/outlet/settings") ||
		pathname.startsWith("/outlet/profile")
	);
}

export function getOutletNavItems(
	role: OutletSubRole | null | undefined,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
): OutletNavItem[] {
	if (isOrgProfileOnly(orgStatus)) return [];
	const r = role ?? OUTLET_LEAST_PRIVILEGE;
	return ALL_NAV.filter((item) => {
		if (item.to === "/outlet/bookings") {
			// `viewBookings` is here so a Director keeps the page and loses only the
			// buttons on it — the owner asked for Post Job read-only rather than gone.
			return (
				outletCan(r, "postJob", modulePermissions) ||
				outletCan(r, "viewBookings", modulePermissions) ||
				outletCan(r, "orderSpecialService", modulePermissions)
			);
		}
		return outletCan(r, item.permission, modulePermissions);
	});
}

export function getOutletDefaultRoute(
	role: OutletSubRole | null | undefined,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
): string {
	if (isOrgProfileOnly(orgStatus)) return OUTLET_PENDING_PROFILE_PATH;
	const items = getOutletNavItems(role, orgStatus, modulePermissions);
	return items[0]?.to ?? "/outlet/billing";
}

/** Route access for outlet sub-routes (pathname from router). */
export function canAccessOutletPath(
	role: OutletSubRole | null | undefined,
	pathname: string,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
): boolean {
	if (isOrgProfileOnly(orgStatus)) {
		return isOutletPendingProfilePath(pathname);
	}
	const r = role ?? OUTLET_LEAST_PRIVILEGE;
	const can = (p: Permission) => outletCan(r, p, modulePermissions);
	if (pathname === "/outlet" || pathname === "/outlet/") {
		return can("viewLiveDashboard");
	}
	if (pathname.startsWith("/outlet/bookings")) {
		return can("postJob") || can("viewBookings") || can("orderSpecialService");
	}
	// Deliberately NOT widened to `viewBookings`: ordering is the only thing this
	// page does, so a role that cannot order has no read to do here. That is what
	// keeps Special Service hidden outright for a Director while Post Job stays.
	if (pathname.startsWith("/outlet/special-service")) {
		return can("orderSpecialService") || can("postJob");
	}
	if (pathname.startsWith("/outlet/history")) return can("viewHistory");
	if (pathname.startsWith("/outlet/calendar")) return can("viewLiveDashboard");
	if (pathname.startsWith("/outlet/ratings")) return can("viewLiveDashboard");
	if (pathname.startsWith("/outlet/billing")) {
		return can("viewBilling") || can("viewSalesDashboard");
	}
	if (pathname.startsWith("/outlet/subscription")) return can("viewSettings");
	if (pathname.startsWith("/outlet/workspace")) return can("viewWorkspace");
	if (pathname.startsWith("/outlet/settings")) return can("viewSettings");
	if (pathname.startsWith("/outlet/profile")) return true;
	return false;
}
