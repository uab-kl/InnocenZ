import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import {
	canModule,
	OUTLET_FEATURE_MODULE,
} from "@/lib/auth/module-permissions";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** Matches Module 10 outlet columns: Owner, Finance, Ops Head */
export type OutletSubRole = "outlet_owner" | "outlet_finance" | "outlet_ops";

/**
 * Resolvers, not strings — and not dictionary keys either. A key is itself a
 * `string`, so rendering the map value directly type-checks and ships the key
 * name to screen. See AGENCY_SUB_ROLE_LABELS for the bug that taught us this.
 *
 * Record keys stay the API sub-role values used by the matrix below.
 */
export const OUTLET_SUB_ROLE_LABELS: Record<
	OutletSubRole,
	(t: PortalTranslations) => string
> = {
	outlet_owner: (t) => t.roles.outletOwner,
	outlet_finance: (t) => t.roles.outletFinance,
	outlet_ops: (t) => t.roles.outletOps,
};

type Permission =
	| "postJob"
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
	| "orderSpecialService";

type ModulePerm = { moduleKey: string; permissionType: string };

const ROLE_PERMISSIONS: Record<OutletSubRole, Permission[]> = {
	outlet_owner: [
		"postJob",
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
	],
	outlet_ops: [
		"postJob",
		"viewLiveDashboard",
		"logSales",
		"sealShift",
		"confirmShift",
		"ratePrs",
		"manageShiftStaffing",
		"viewWorkspace",
		"manageWorkspace",
		"viewSettings",
		"orderSpecialService",
	],
};

export function outletCan(
	role: OutletSubRole | null | undefined,
	permission: Permission,
	modulePermissions?: ModulePerm[] | null,
): boolean {
	const r = role ?? "outlet_owner";
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
	/*
	 * HIDDEN — owner's call. The screen is not broken; it is simply not in
	 * use, so it is commented out rather than deleted. Turning it back on is
	 * this block plus the path check in `canAccessOutletPath` and the tab in
	 * `nav-back.ts` — all three, or the link returns without the route.
	 *
	 * Rating a PR from Today is UNAFFECTED: that action lives on the shift
	 * card, not here.
	 */
	// {
	// 	to: "/outlet/ratings",
	// 	label: "Ratings",
	// 	icon: iconForNav("Ratings"),
	// 	permission: "viewLiveDashboard",
	// },
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
	const r = role ?? "outlet_owner";
	return ALL_NAV.filter((item) => {
		if (item.to === "/outlet/bookings") {
			return (
				outletCan(r, "postJob", modulePermissions) ||
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
	const r = role ?? "outlet_owner";
	const can = (p: Permission) => outletCan(r, p, modulePermissions);
	if (pathname === "/outlet" || pathname === "/outlet/") {
		return can("viewLiveDashboard");
	}
	if (pathname.startsWith("/outlet/bookings")) {
		return can("postJob") || can("orderSpecialService");
	}
	if (pathname.startsWith("/outlet/special-service")) {
		return can("orderSpecialService") || can("postJob");
	}
	if (pathname.startsWith("/outlet/history")) return can("viewHistory");
	if (pathname.startsWith("/outlet/calendar")) return can("viewLiveDashboard");
	// Hidden with the nav entry above — falls through to `return false`, so
	// typing the URL redirects to the default route instead of rendering.
	// if (pathname.startsWith("/outlet/ratings")) return can("viewLiveDashboard");
	if (pathname.startsWith("/outlet/billing")) {
		return can("viewBilling") || can("viewSalesDashboard");
	}
	if (pathname.startsWith("/outlet/subscription")) return can("viewSettings");
	if (pathname.startsWith("/outlet/workspace")) return can("viewWorkspace");
	if (pathname.startsWith("/outlet/settings")) return can("viewSettings");
	if (pathname.startsWith("/outlet/profile")) return true;
	return false;
}
