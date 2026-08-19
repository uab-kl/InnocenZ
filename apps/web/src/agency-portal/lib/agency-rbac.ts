import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import {
	AGENCY_FEATURE_MODULE,
	canModule,
} from "@/lib/auth/module-permissions";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** Module 9 · Agency Owner vs Agency Finance */
export type AgencySubRole = "agency_owner" | "agency_finance";

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
};

type Permission =
	| "viewHome"
	| "approvePrSignups"
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

type ModulePerm = { moduleKey: string; permissionType: string };

const ROLE_PERMISSIONS: Record<AgencySubRole, Permission[]> = {
	agency_owner: [
		"viewHome",
		"approvePrSignups",
		"assignShifts",
		"managePr",
		"viewSettings",
		"editSettings",
		"viewPv",
		"raisePv",
		"viewCollections",
		"confirmReconciliation",
		"viewHistory",
		"viewWorkforce",
		"viewLiveFloor",
		"overrideSignedPv",
	],
	/**
	 * Finance keeps Roster and the PR records; it does NOT get the live floor.
	 *
	 * `viewLiveFloor` is absent, and that is the whole difference (owner's call, 11
	 * Aug 2026): the PR ON DUTY tile sat on the finance home page directly under
	 * "Read-only overview — payroll & PV only", showing who is on shift right now —
	 * which is not a payroll question. `viewWorkforce` stays, so the Roster nav item
	 * and `/agency/roster` are untouched.
	 *
	 * A wage is checked against the SEALED stamps on the voucher, never against who
	 * happens to be on the floor at this moment, so nothing finance actually does
	 * loses a source it needed.
	 */
	agency_finance: [
		"viewHome",
		"viewSettings",
		"viewPv",
		"raisePv",
		"overrideSignedPv",
		"viewCollections",
		"confirmReconciliation",
		"viewHistory",
		"viewWorkforce",
	],
};

function resolveAgencySubRole(
	role: AgencySubRole | null | undefined,
): AgencySubRole {
	if (role && role in ROLE_PERMISSIONS) return role;
	return "agency_owner";
}

/** Prefer module C/R/U from /auth/me when present; else fall back to sub-role matrix. */
export function agencyCan(
	role: AgencySubRole | null | undefined,
	permission: Permission,
	modulePermissions?: ModulePerm[] | null,
): boolean {
	const fallback =
		ROLE_PERMISSIONS[resolveAgencySubRole(role)].includes(permission);
	if (!modulePermissions?.length) return fallback;

	const agencyKeys = new Set(
		Object.values(AGENCY_FEATURE_MODULE).map((m) => m.key),
	);
	const hasAgencyGrants = modulePermissions.some((p) =>
		agencyKeys.has(p.moduleKey),
	);
	// Permissions from another portal (or stale rows) must not lock this console out.
	if (!hasAgencyGrants) return fallback;

	const map = AGENCY_FEATURE_MODULE[permission];
	if (!map) return fallback;
	return canModule(modulePermissions, map.key, map.type);
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
		icon: iconForNav("Approvals"),
		permission: "approvePrSignups",
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
): AgencyNavItem[] {
	if (isOrgProfileOnly(orgStatus)) return [];
	const r = resolveAgencySubRole(role);
	return ALL_NAV.filter((item) =>
		agencyCan(r, item.permission, modulePermissions),
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

export function canAccessAgencyPath(
	role: AgencySubRole | null | undefined,
	pathname: string,
	orgStatus?: string | null,
	modulePermissions?: ModulePerm[] | null,
): boolean {
	if (isOrgProfileOnly(orgStatus)) {
		return pathname.startsWith("/agency/profile");
	}
	const r = resolveAgencySubRole(role);
	const can = (p: Permission) => agencyCan(r, p, modulePermissions);
	if (pathname === "/agency" || pathname === "/agency/") return can("viewHome");
	if (pathname.startsWith("/agency/roster")) return can("viewWorkforce");
	if (pathname.startsWith("/agency/pv")) return can("viewPv");
	if (pathname.startsWith("/agency/special-service")) return can("viewPv");
	if (pathname.startsWith("/agency/history")) return can("viewHistory");
	if (pathname.startsWith("/agency/subscription")) return can("viewSettings");
	if (pathname.startsWith("/agency/pending")) return can("approvePrSignups");
	if (pathname.startsWith("/agency/prs")) return can("managePr");
	if (pathname.startsWith("/agency/outlets")) return can("managePr");
	if (pathname.startsWith("/agency/profile")) return can("viewSettings");
	if (pathname.startsWith("/agency/live")) return can("viewWorkforce");
	return true;
}

export type AgencyHomeTile = {
	to: string;
	title: string;
	desc: string;
	permission: Permission;
	badge?: string;
};
