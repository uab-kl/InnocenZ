import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";

/** Matches Module 10 outlet columns: Owner, Finance, Ops Head */
export type OutletSubRole = "outlet_owner" | "outlet_finance" | "outlet_ops";

export const OUTLET_SUB_ROLE_LABELS: Record<OutletSubRole, string> = {
	outlet_owner: "Outlet Owner",
	outlet_finance: "Outlet Finance",
	outlet_ops: "Outlet Ops Head",
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
): boolean {
	const r = role ?? "outlet_owner";
	return ROLE_PERMISSIONS[r].includes(permission);
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
		// Viewing is `viewLiveDashboard`, not `ratePrs`, deliberately: GET /rating
		// carries no sub-role guard, so Outlet Finance — who cannot rate — may still
		// read what the venue has said about a PR. The screen itself says which of
		// the two the reader holds.
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
): OutletNavItem[] {
	// Pending / suspended orgs may sign in but only use profile/settings.
	if (isOrgProfileOnly(orgStatus)) return [];
	const r = role ?? "outlet_owner";
	return ALL_NAV.filter((item) => {
		if (item.to === "/outlet/bookings") {
			return outletCan(r, "postJob") || outletCan(r, "orderSpecialService");
		}
		return outletCan(r, item.permission);
	});
}

export function getOutletDefaultRoute(
	role: OutletSubRole | null | undefined,
	orgStatus?: string | null,
): string {
	if (isOrgProfileOnly(orgStatus)) return OUTLET_PENDING_PROFILE_PATH;
	const items = getOutletNavItems(role, orgStatus);
	return items[0]?.to ?? "/outlet/billing";
}

/** Route access for outlet sub-routes (pathname from router). */
export function canAccessOutletPath(
	role: OutletSubRole | null | undefined,
	pathname: string,
	orgStatus?: string | null,
): boolean {
	if (isOrgProfileOnly(orgStatus)) {
		return isOutletPendingProfilePath(pathname);
	}
	const r = role ?? "outlet_owner";
	if (pathname === "/outlet" || pathname === "/outlet/") {
		return outletCan(r, "viewLiveDashboard");
	}
	if (pathname.startsWith("/outlet/bookings")) {
		return outletCan(r, "postJob") || outletCan(r, "orderSpecialService");
	}
	if (pathname.startsWith("/outlet/special-service")) {
		return outletCan(r, "orderSpecialService") || outletCan(r, "postJob");
	}
	if (pathname.startsWith("/outlet/history"))
		return outletCan(r, "viewHistory");
	if (pathname.startsWith("/outlet/calendar"))
		return outletCan(r, "viewLiveDashboard");
	if (pathname.startsWith("/outlet/ratings"))
		return outletCan(r, "viewLiveDashboard");
	if (pathname.startsWith("/outlet/billing")) {
		return outletCan(r, "viewBilling") || outletCan(r, "viewSalesDashboard");
	}
	if (pathname.startsWith("/outlet/subscription"))
		return outletCan(r, "viewSettings");
	if (pathname.startsWith("/outlet/workspace"))
		return outletCan(r, "viewWorkspace");
	if (pathname.startsWith("/outlet/settings"))
		return outletCan(r, "viewSettings");
	if (pathname.startsWith("/outlet/profile")) return true;
	return false;
}
