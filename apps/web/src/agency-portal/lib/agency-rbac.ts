import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import type { LucideIcon } from "lucide-react";
import { isOrgProfileOnly } from "@/components/organization/org-status";
import {
	AGENCY_FEATURE_MODULE,
	canModule,
} from "@/lib/auth/module-permissions";

/** Module 9 · Agency Owner, Finance, Director, Guarantor */
export type AgencySubRole =
	| "agency_owner"
	| "agency_finance"
	| "agency_director"
	| "agency_guarantor";

export const AGENCY_SUB_ROLE_LABELS: Record<AgencySubRole, string> = {
	agency_owner: "Agency Owner",
	agency_finance: "Agency Finance",
	agency_director: "Agency Director",
	agency_guarantor: "Agency Guarantor",
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

type ModulePerm = { moduleKey: string; permissionType: string };

const AGENCY_OWNER_PERMISSIONS: Permission[] = [
	"viewHome",
	"approvePrSignups",
	"viewApprovals",
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
];

const ROLE_PERMISSIONS: Record<AgencySubRole, Permission[]> = {
	agency_owner: AGENCY_OWNER_PERMISSIONS,
	/**
	 * The owner's stand-in, at the owner's level — SHARING the owner's list
	 * rather than restating it, so the two cannot drift. On this portal that is
	 * what carries `raisePv` and `overrideSignedPv`: paying PRs while the owner
	 * is unavailable is the reason the role was asked for.
	 */
	agency_guarantor: AGENCY_OWNER_PERMISSIONS,
	/**
	 * VIEW ONLY. Every agency screen readable, nothing writable.
	 *
	 * Reads the payroll it exists to oversee (`viewPv`) and cannot raise, sign or
	 * override a voucher — `raisePv` and `overrideSignedPv` are absent, and that
	 * is precisely the line between this role and the Guarantor.
	 *
	 * `viewLiveFloor` IS granted, unlike finance. That permission is matrix-only
	 * by design (it has no `AGENCY_FEATURE_MODULE` entry, so no module grant can
	 * confer it), and it was taken off finance on 11 Aug 2026 because a payroll
	 * role has no business with who is on the floor right now. A Director's
	 * business is precisely oversight of the organisation, so it is included —
	 * say the word if that tile should come off this role too.
	 *
	 * Its own login and security is not here and needs no entry: changing your
	 * own password, email or mobile is not an agency permission.
	 */
	agency_director: [
		"viewHome",
		"viewApprovals",
		"viewPv",
		"viewCollections",
		"viewHistory",
		"viewWorkforce",
		"viewLiveFloor",
		"viewSettings",
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
	if (pathname.startsWith("/agency/pending")) return can("viewApprovals");
	// `viewWorkforce` alongside `managePr`: these are the PR and outlet RECORDS,
	// and gating them on the update permission alone hid them from a role whose
	// whole definition is reading the organisation.
	if (pathname.startsWith("/agency/prs")) {
		return can("managePr") || can("viewWorkforce");
	}
	if (pathname.startsWith("/agency/outlets")) {
		return can("managePr") || can("viewWorkforce");
	}
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
