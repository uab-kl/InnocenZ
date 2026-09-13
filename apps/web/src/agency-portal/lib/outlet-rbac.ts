import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { OUTLET_ROLE_GRANTS } from "@agency-portal/lib/rbac-grants.generated";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import {
	buildRoleMatrix,
	canModule,
	grantsForPortal,
	OUTLET_FEATURE_MODULE,
} from "@/lib/auth/module-permissions";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** Matches Module 10 outlet columns: Owner, Finance, Ops Head, Director, Guarantor */
export type OutletSubRole =
	| "outlet_owner"
	| "outlet_finance"
	| "outlet_ops"
	| "outlet_director"
	| "outlet_guarantor";

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
	outlet_director: (t) => t.roles.outletDirector,
	outlet_guarantor: (t) => t.roles.outletGuarantor,
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
	 * `OUTLET_FEATURE_MODULE` entry): the server gates it by LANE, and there is
	 * no `cutlost` module to grant — see MATRIX_ONLY below.
	 *
	 * ⚠️ This note used to say the lane gate existed "because outlet Finance
	 * holds no `booking` permission at all". That was wrong, and being wrong in
	 * a comment is how the whole matrix drifted: the database grants Finance
	 * `booking` create, read and update, and the server admits them.
	 *
	 * Without this the button rendered for everyone — the component had no
	 * permission check at all — so a Director could click it and collect a 403.
	 */
	| "requestCutLoss";

type ModulePerm = {
	moduleKey: string;
	permissionType: string;
	/** Which console granted it — see `grantsForPortal`. */
	portalCode?: string | null;
	/** Which ORGANISATION granted it — see `grantsForPortal`. */
	orgId?: string | null;
};

/**
 * Gated by LANE on the server, so there is no `role_permission` row to derive
 * it from — this list must mirror the server's own.
 *
 * `POST /cutlost` is `requireOutletSubRole('owner', 'finance', 'operations_head')`
 * (cutlost.routes.ts), and `holdsOutletLane` folds guarantor into owner, so a
 * Director is the only lane refused.
 *
 * ⚠️ The reason it is lane-gated is simply that there is NO `cutlost` module —
 * the outlet portal has nine (booking, dashboard, sales, billing, rating,
 * history, workspace, settings, special_service) and none of them covers this,
 * so there is no grant to read. The older note here said it was lane-gated
 * "because outlet Finance holds no `booking` permission at all"; that stopped
 * being true — the database grants Finance `booking` create, read and update.
 */
const MATRIX_ONLY: Partial<Record<Permission, readonly OutletSubRole[]>> = {
	requestCutLoss: [
		"outlet_owner",
		"outlet_guarantor",
		"outlet_finance",
		"outlet_ops",
	],
};

/**
 * DERIVED FROM THE DATABASE — owner's rule, 11 Sep 2026: "web matrix must
 * follow what database given."
 *
 * ⚠️ This was a hand-written list, and it had drifted 14 cells from
 * `role_permission`. The database decided every one of them at runtime (see
 * `outletCan` below, where a real session's grants answer instead of this), so
 * the list was never a policy — it was a stale description contradicting the
 * screen. Three things it claimed:
 *
 *   · Finance could not Post Job. The database grants Finance `booking:create`
 *     and `POST /shift` checks exactly that, so Finance could, and did.
 *   · Ops Head could not see Sales or History. The database grants both.
 *   · The Owner could `confirmDaily`. At the time NO outlet role held
 *     `billing:update`, so the server refused everyone — the matrix offered a
 *     button nobody could press. The owner has since granted it to Owner and
 *     Guarantor in `seed-rbac.ts`, so it now works for exactly those two;
 *     Finance, which the old matrix also granted it to, still does not.
 *
 * It now comes from `rbac-grants.generated.ts`, written by
 * `node tools/scripts/sync-rbac-matrix.mjs` from the live table. To change what
 * a lane may do, change `role_permission` and re-run the sync; editing here
 * does nothing, and `--check` fails while the snapshot is stale.
 */
const ROLE_PERMISSIONS: Record<OutletSubRole, Permission[]> = buildRoleMatrix<
	OutletSubRole,
	Permission
>(OUTLET_ROLE_GRANTS, OUTLET_FEATURE_MODULE, MATRIX_ONLY);

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

/**
 * The venue lane's name, resolved the way its permissions are — the twin of
 * `agencySubRoleLabel`, and added for the same reason: the portal header
 * defaulted an unresolved lane to OWNER while every permission check defaulted
 * it to least privilege.
 */
export function outletSubRoleLabel(
	role: OutletSubRole | null | undefined,
	t: PortalTranslations,
): string {
	return OUTLET_SUB_ROLE_LABELS[role ?? OUTLET_LEAST_PRIVILEGE](t);
}

export function outletCan(
	role: OutletSubRole | null | undefined,
	permission: Permission,
	modulePermissions?: ModulePerm[] | null,
	/** The organisation being worked in, so another org's lane cannot answer. */
	activeOrgId?: string | null,
): boolean {
	const r = role ?? OUTLET_LEAST_PRIVILEGE;
	const fallback = ROLE_PERMISSIONS[r].includes(permission);
	if (!modulePermissions?.length) return fallback;

	/*
	 * THIS CONSOLE'S grants only. `settings`, `dashboard` and `history` are a
	 * separate module row per portal, so an agency grant used to answer an
	 * outlet question by key alone — see `grantsForPortal`.
	 */
	const grants = grantsForPortal(modulePermissions, "outlet", activeOrgId);
	if (!grants.length) return fallback;

	const outletKeys = new Set(
		Object.values(OUTLET_FEATURE_MODULE).map((m) => m.key),
	);
	const hasOutletGrants = grants.some((p) => outletKeys.has(p.moduleKey));
	if (!hasOutletGrants) return fallback;

	const map = OUTLET_FEATURE_MODULE[permission];
	if (!map) return fallback;
	return canModule(grants, map.key, map.type);
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
	/*
	 * PEOPLE ASKING TO JOIN — the venue's one approval queue.
	 *
	 * `viewSettings`, which is exactly who could reach the queue when it lived
	 * inside Settings: moving it to a page of its own must not quietly change
	 * WHO can see it. The server still decides who may actually approve.
	 */
	{
		to: "/outlet/approvals",
		label: "Approvals",
		icon: iconForNav("Approvals"),
		permission: "viewSettings",
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
	/** The organisation being worked in — see `grantsForPortal`. */
	activeOrgId?: string | null,
): OutletNavItem[] {
	if (isOrgProfileOnly(orgStatus)) return [];
	const r = role ?? OUTLET_LEAST_PRIVILEGE;
	return ALL_NAV.filter((item) => {
		if (item.to === "/outlet/bookings") {
			// `viewBookings` is here so a Director keeps the page and loses only the
			// buttons on it — the owner asked for Post Job read-only rather than gone.
			return (
				outletCan(r, "postJob", modulePermissions, activeOrgId) ||
				outletCan(r, "viewBookings", modulePermissions, activeOrgId) ||
				outletCan(r, "orderSpecialService", modulePermissions, activeOrgId)
			);
		}
		/*
		 * REPORTS — the same OR the ROUTE GUARD and the page already use.
		 *
		 * `/outlet/billing` renders only the sales dashboard, which the page
		 * gates on `viewSalesDashboard`, and `canAccessOutletPath` admits
		 * `viewBilling || viewSalesDashboard`. The nav item asked for
		 * `viewBilling` alone, which agreed with the other two only because the
		 * old hand-written matrix gave Ops Head neither permission.
		 *
		 * Deriving the matrix from the database changed that: Ops Head holds
		 * `sales:read` and NO billing row at all — the one outlet lane between
		 * the two gates. So the sidebar hid a page the database says they may
		 * read, while the route guard let them in by URL and the Today page
		 * linked them straight to it. Three gates, one of them the outlier.
		 */
		if (item.to === "/outlet/billing") {
			return (
				outletCan(r, "viewBilling", modulePermissions, activeOrgId) ||
				outletCan(r, "viewSalesDashboard", modulePermissions, activeOrgId)
			);
		}
		return outletCan(r, item.permission, modulePermissions, activeOrgId);
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
	/** The organisation being worked in, so another org's lane cannot answer. */
	activeOrgId?: string | null,
): boolean {
	if (isOrgProfileOnly(orgStatus)) {
		return isOutletPendingProfilePath(pathname);
	}
	const r = role ?? OUTLET_LEAST_PRIVILEGE;
	const can = (p: Permission) =>
		outletCan(r, p, modulePermissions, activeOrgId);
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
	// Hidden with the nav entry above — falls through to `return false`, so
	// typing the URL redirects to the default route instead of rendering.
	// if (pathname.startsWith("/outlet/ratings")) return can("viewLiveDashboard");
	if (pathname.startsWith("/outlet/billing")) {
		return can("viewBilling") || can("viewSalesDashboard");
	}
	if (pathname.startsWith("/outlet/approvals")) return can("viewSettings");
	if (pathname.startsWith("/outlet/subscription")) return can("viewSettings");
	if (pathname.startsWith("/outlet/workspace")) return can("viewWorkspace");
	if (pathname.startsWith("/outlet/settings")) return can("viewSettings");
	if (pathname.startsWith("/outlet/profile")) return true;
	return false;
}
