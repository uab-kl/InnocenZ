import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { AGENCY_ROLE_GRANTS } from "@agency-portal/lib/rbac-grants.generated";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import {
	AGENCY_FEATURE_MODULE,
	buildRoleMatrix,
	canModule,
	grantsForPortal,
} from "@/lib/auth/module-permissions";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** Module 9 · Agency Owner, Finance, Director, Guarantor */
export type AgencySubRole =
	| "agency_owner"
	| "agency_finance"
	| "agency_director"
	| "agency_guarantor";

/**
 * Resolvers, not strings — and deliberately not dictionary keys either.
 *
 * A key is itself a `string`, so a caller that renders the map value directly
 * type-checks and ships the key name to the screen. That exact mistake put
 * "statusSent" on the payroll filter chips. A function cannot be rendered by
 * accident: forgetting to call it is a type error.
 *
 * Record keys stay the API's own sub-role values.
 */
export const AGENCY_SUB_ROLE_LABELS: Record<
	AgencySubRole,
	(t: PortalTranslations) => string
> = {
	agency_owner: (t) => t.roles.agencyOwner,
	agency_finance: (t) => t.roles.agencyFinance,
	agency_director: (t) => t.roles.agencyDirector,
	agency_guarantor: (t) => t.roles.agencyGuarantor,
};

type Permission =
	| "viewHome"
	| "approvePrSignups"
	/**
	 * SEE the Approvals queue without being able to answer it.
	 *
	 * Split from `approvePrSignups` on 17 Aug 2026 for the Director. Approvals
	 * was gated solely on `approvals:update`, so a view-only role lost the whole
	 * screen rather than seeing it read-only — the same shape as the outlet's
	 * Post Job needing `viewBookings`.
	 */
	| "viewApprovals"
	| "assignShifts"
	| "managePr"
	| "viewSettings"
	| "editSettings"
	| "viewPv"
	| "raisePv"
	| "viewCollections"
	| "confirmReconciliation"
	| "viewHistory"
	| "viewWorkforce"
	/**
	 * Who is on the floor RIGHT NOW — the home page's PR ON DUTY tile and the live
	 * workforce table under it. Distinct from `viewWorkforce`, which is the roster
	 * and the PR records.
	 *
	 * Split out on 11 Aug 2026. `viewWorkforce` was granting three surfaces at once
	 * — the live tile, the Roster nav item, and the `/agency/roster` route — so
	 * there was no way to take the tile off the finance home page (it sat directly
	 * under "Read-only overview — payroll & PV only") without also removing Roster,
	 * which the owner wanted kept.
	 *
	 * ⚠️ Deliberately has NO entry in `AGENCY_FEATURE_MODULE`. `agencyCan` falls
	 * back to the matrix below for any permission it cannot map (`if (!map) return
	 * fallback`), so this stays owner-only no matter what module grants /auth/me
	 * returns. Mapping it to `workforce:read` would re-grant it to finance and undo
	 * the whole point of the split.
	 */
	| "viewLiveFloor"
	| "overrideSignedPv";

type ModulePerm = {
	moduleKey: string;
	permissionType: string;
	/** Which console granted it — see `grantsForPortal`. */
	portalCode?: string | null;
	/** Which ORGANISATION granted it — see `grantsForPortal`. */
	orgId?: string | null;
};

/**
 * Gated by LANE (or by nothing on the server at all), so there is no
 * `role_permission` row to derive it from — this list is kept in step by hand.
 *
 * `viewLiveFloor` is the home page's PR ON DUTY tile and the live workforce
 * table under it, split from `viewWorkforce` on 11 Aug 2026 so the tile could
 * come off the finance home page without also removing Roster. It is
 * deliberately UNMAPPED: no module grant can confer it, which is what keeps it
 * off finance no matter what `/auth/me` returns. Owner, guarantor and director
 * hold it — a payroll role has no business with who is on the floor right now.
 */
const MATRIX_ONLY: Partial<Record<Permission, readonly AgencySubRole[]>> = {
	viewLiveFloor: ["agency_owner", "agency_guarantor", "agency_director"],
};

/**
 * DERIVED FROM THE DATABASE — owner's rule, 11 Sep 2026: "web matrix must
 * follow what database given."
 *
 * Unlike the outlet twin, this portal's hand-written list happened to agree
 * with `role_permission` in all four lanes — verified cell by cell against the
 * live table on 11 Sep 2026. It is derived anyway: agreeing today is not a
 * property a second copy keeps, and the outlet list agreed once too.
 *
 * Written by `node tools/scripts/sync-rbac-matrix.mjs`. To change what a lane
 * may do, change `role_permission` and re-run the sync.
 */
const ROLE_PERMISSIONS: Record<AgencySubRole, Permission[]> = buildRoleMatrix<
	AgencySubRole,
	Permission
>(AGENCY_ROLE_GRANTS, AGENCY_FEATURE_MODULE, MATRIX_ONLY);

/**
 * What an agency operator is treated as when we do not KNOW what they are.
 *
 * Director — view only. Never the owner. An unresolved role is a question, not
 * a promotion: a real session whose membership has not loaded yet (a fresh
 * device, a different URL origin, a cold cache, a failed fetch) used to be
 * handed the owner's full console until the answer arrived, and stayed there
 * if it never did. Under-privileging for a moment is recoverable; granting the
 * top lane for a moment is not.
 */
export const AGENCY_LEAST_PRIVILEGE: AgencySubRole = "agency_director";

function resolveAgencySubRole(
	role: AgencySubRole | null | undefined,
): AgencySubRole {
	if (role && role in ROLE_PERMISSIONS) return role;
	return AGENCY_LEAST_PRIVILEGE;
}

/**
 * 🔴 THE LANE'S NAME, RESOLVED THE SAME WAY ITS PERMISSIONS ARE.
 *
 * Five screens wrote `AGENCY_SUB_ROLE_LABELS[subRole ?? "agency_owner"]` —
 * defaulting an unresolved lane to OWNER while `resolveAgencySubRole` defaults
 * the same null to DIRECTOR. So the portal header read "Atlas PR (Owner)" over
 * a sidebar built at least privilege, a payment voucher printed "Owner" beside
 * a signature, and sign-in sent the session to the owner's landing page.
 *
 * One resolver for both halves. A person is never told they hold a lane the
 * screen is not giving them — and the safe direction is the quiet one.
 */
export function agencySubRoleLabel(
	role: AgencySubRole | null | undefined,
	t: PortalTranslations,
): string {
	return AGENCY_SUB_ROLE_LABELS[resolveAgencySubRole(role)](t);
}

/** Prefer module C/R/U from /auth/me when present; else fall back to sub-role matrix. */
export function agencyCan(
	role: AgencySubRole | null | undefined,
	permission: Permission,
	modulePermissions?: ModulePerm[] | null,
	/** The organisation being worked in, so another org's lane cannot answer. */
	activeOrgId?: string | null,
): boolean {
	const fallback =
		ROLE_PERMISSIONS[resolveAgencySubRole(role)].includes(permission);
	if (!modulePermissions?.length) return fallback;

	/*
	 * THIS CONSOLE'S grants only — the twin of the outlet check. Sharing a
	 * module KEY across portals is what let one console answer the other's
	 * question; see `grantsForPortal`.
	 */
	const grants = grantsForPortal(modulePermissions, "agency", activeOrgId);
	if (!grants.length) return fallback;

	const agencyKeys = new Set(
		Object.values(AGENCY_FEATURE_MODULE).map((m) => m.key),
	);
	const hasAgencyGrants = grants.some((p) => agencyKeys.has(p.moduleKey));
	// Permissions from another portal (or stale rows) must not lock this console out.
	if (!hasAgencyGrants) return fallback;

	const map = AGENCY_FEATURE_MODULE[permission];
	if (!map) return fallback;
	return canModule(grants, map.key, map.type);
}

export type AgencyNavItem = {
	to: string;
	label: string;
	icon: LucideIcon;
	permission: Permission;
};

const ALL_NAV: AgencyNavItem[] = [
	{
		to: "/agency",
		label: "Today",
		icon: iconForNav("Today"),
		permission: "viewHome",
	},
	{
		to: "/agency/roster",
		label: "Roster",
		icon: iconForNav("Roster"),
		permission: "viewWorkforce",
	},
	{
		to: "/agency/pending",
		label: "Approvals",
		// `viewApprovals`, not `approvePrSignups` — an owner holds both, and this
		// is what keeps the queue visible to a role that may read but not answer.
		icon: iconForNav("Approvals"),
		permission: "viewApprovals",
	},
	{
		to: "/agency/pv",
		label: "Payroll",
		icon: iconForNav("Payroll"),
		permission: "viewPv",
	},
	{
		to: "/agency/history",
		label: "History",
		icon: iconForNav("History"),
		permission: "viewHistory",
	},
];

/** Profile path while the organisation is pending or suspended. */
export const AGENCY_PENDING_PROFILE_PATH = "/agency/profile";

export function getAgencyNavItems(
	role: AgencySubRole | null | undefined,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
	/** The organisation being worked in — see `grantsForPortal`. */
	activeOrgId?: string | null,
): AgencyNavItem[] {
	if (isOrgProfileOnly(orgStatus)) return [];
	const r = resolveAgencySubRole(role);
	return ALL_NAV.filter((item) =>
		agencyCan(r, item.permission, modulePermissions, activeOrgId),
	);
}

export function getAgencyDefaultRoute(
	role: AgencySubRole | null | undefined,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
): string {
	if (isOrgProfileOnly(orgStatus)) return AGENCY_PENDING_PROFILE_PATH;
	const items = getAgencyNavItems(role, orgStatus, modulePermissions);
	return items[0]?.to ?? "/agency/pv";
}

/**
 * WHICH PERMISSION A PATH COSTS — the one copy of that map.
 *
 * ⚠️ Split out of `canAccessAgencyPath` on 13 Sep 2026 because a guard only a
 * ROUTE can ask is a guard every LINK gets to disagree with, and four of them
 * did. `/agency/prs` was tightened to `managePr` alone (see the note below), and
 * the four places that offer a trip there were left behind it:
 *
 *   · `RosterShiftTable`'s PR-name link — every name on the roster,
 *   · the roster header's "Manage PR" button, gated on `assignShifts`,
 *   · `LiveWorkforceTable`'s clickable row,
 *   · the `pr_rating_low` notification's destination.
 *
 * Roster and Live both cost `viewWorkforce`, which ALL FOUR lanes hold, so
 * Finance and Director read those screens legitimately — and every PR name on
 * them was a link that bounced them straight back to the agency home, losing
 * the screen they were reading with nothing said. `hrefFor` already returns
 * `undefined` "when there is nowhere sensible to go"; these four had no way to
 * ask.
 *
 * Returning the PERMISSION rather than a yes/no is what lets a link ask the
 * same question the route will ask, with its own `can` — `useAgencyCan` in a
 * component, the assembled one here. `null` means the path is unguarded.
 */
export function agencyPathPermission(pathname: string): Permission | null {
	if (pathname === "/agency" || pathname === "/agency/") return "viewHome";
	if (pathname.startsWith("/agency/roster")) return "viewWorkforce";
	if (pathname.startsWith("/agency/pv")) return "viewPv";
	if (pathname.startsWith("/agency/special-service")) return "viewPv";
	if (pathname.startsWith("/agency/history")) return "viewHistory";
	if (pathname.startsWith("/agency/subscription")) return "viewSettings";
	if (pathname.startsWith("/agency/pending")) return "viewApprovals";
	// `viewWorkforce` alongside `managePr`: these are the PR and outlet RECORDS,
	// and gating them on the update permission alone hid them from a role whose
	// whole definition is reading the organisation.
	/*
	 * ⚠️ `managePr` ALONE — the `|| viewWorkforce` here was a promise the pages
	 * then had to break.
	 *
	 * Every agency lane holds `workforce:read`, so `viewWorkforce` admitted all
	 * four to these two routes — but `prs.tsx:395` and `outlets.tsx:137` both
	 * hard-refuse on `!can("managePr")`. Confirmed in a browser: agency Finance
	 * following the home tile landed on "Access restricted · Finance role cannot
	 * manage PR roster." The route said yes, the page said no, and the tile
	 * offered the trip.
	 *
	 * These are the MANAGEMENT screens; the read `workforce:read` pays for is the
	 * Roster, which Finance and Director both keep. Aligning the route with the
	 * pages also revives the home tile's plain-figure branch, which was
	 * unreachable for exactly this reason.
	 */
	if (pathname.startsWith("/agency/prs")) {
		return "managePr";
	}
	// The twin of `/agency/prs` above — `outlets.tsx:137` refuses on the same
	// permission, so the route must ask for the same one.
	if (pathname.startsWith("/agency/outlets")) {
		return "managePr";
	}
	if (pathname.startsWith("/agency/profile")) return "viewSettings";
	if (pathname.startsWith("/agency/live")) return "viewWorkforce";
	return null;
}

export function canAccessAgencyPath(
	role: AgencySubRole | null | undefined,
	pathname: string,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
	/** The organisation being worked in, so another org's lane cannot answer. */
	activeOrgId?: string | null,
): boolean {
	if (isOrgProfileOnly(orgStatus)) {
		return pathname.startsWith("/agency/profile");
	}
	const r = resolveAgencySubRole(role);
	const needed = agencyPathPermission(pathname);
	if (!needed) return true;
	return agencyCan(r, needed, modulePermissions, activeOrgId);
}

export type AgencyHomeTile = {
	to: string;
	title: string;
	desc: string;
	permission: Permission;
	badge?: string;
};
