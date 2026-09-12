/**
 * ONE permission authority for the portal screens.
 *
 * `agencyCan` / `outletCan` take module grants as an optional third argument,
 * and only the route layouts were passing them. So the nav and the route guard
 * answered with sub-role + module grants while every page answered with the
 * sub-role alone — an agency owner with full grants got the owner sidebar, was
 * admitted to /agency/prs, and was then refused by the page with "Finance role
 * cannot manage PR roster". A gate that disagrees with the gate in front of it
 * is a dead end, not a denial.
 *
 * These hooks assemble the argument once so a screen cannot forget it. Demo
 * sessions have no backend grants and fall back to the sub-role matrix, exactly
 * as the route layouts already do.
 */
import { type AgencySubRole, agencyCan } from "@agency-portal/lib/agency-rbac";
import { type OutletSubRole, outletCan } from "@agency-portal/lib/outlet-rbac";
import { useStore } from "@agency-portal/lib/store";
import { useCallback } from "react";
import { getActiveOrg } from "@/lib/active-org";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { useProfile } from "@/lib/auth/use-profile";

type AgencyPermission = Parameters<typeof agencyCan>[1];
type OutletPermission = Parameters<typeof outletCan>[1];
type ModulePerm = { moduleKey: string; permissionType: string };

/** Module grants for a real session; `undefined` for demo (sub-role matrix). */
function useModulePermissions(): ModulePerm[] | undefined {
	const { data: profile } = useProfile();
	return getPortalSessionKind() === "real"
		? profile?.modulePermissions
		: undefined;
}

/**
 * The organisation this tab is working in.
 *
 * ⚠️ Without it, somebody holding DIFFERENT lanes in two organisations of the
 * same kind — Owner at one venue, Director at another — gets the union, and the
 * Director is shown the owner's controls at the venue where they may do
 * nothing. The server reads that venue's own lane and refuses; this stops the
 * screen from claiming otherwise.
 */
function useActiveOrgId(): string | null {
	return getActiveOrg()?.id ?? null;
}

/**
 * MAY THIS PERSON SPEND THE ORGANISATION'S MONEY? The OWNER alone.
 *
 * Owner, 12 Sep 2026: "owner priority to get charge, guarantor no payment made
 * like other member just see paid and unpaid, owner make payment fpx and the
 * payment method continue."
 *
 * ⚠️ NOT a module permission, and deliberately not derived from one. Paying is
 * the ONE place the guarantor does not stand in for the owner — everywhere
 * else they do, and `settings:update` (which the Subscription page's `canEdit`
 * uses) is held by both. A permission cannot express "owner but not the
 * stand-in", so this mirrors the server's LANE check instead:
 * `orgOwnerPaysOnly` asks `holdsXLane(['owner'], foldGuarantor: false)`.
 *
 * Like the two `MATRIX_ONLY` entries, this is kept in step with the server by
 * hand — a wrong answer here is a Pay button that collects a 403, or a
 * guarantor shown a card they may not change.
 */
export function useAgencyIsOwner(): boolean {
	return useStore((s) => s.agencySubRole) === "agency_owner";
}

/** The venue twin of `useAgencyIsOwner` — see it for why this is a lane, not a grant. */
export function useOutletIsOwner(): boolean {
	return useStore((s) => s.outletSubRole) === "outlet_owner";
}
/** `can("managePr")` for the signed-in agency operator. */
export function useAgencyCan(): (permission: AgencyPermission) => boolean {
	const subRole = useStore((s) => s.agencySubRole);
	const modulePermissions = useModulePermissions();
	const activeOrgId = useActiveOrgId();
	return useCallback(
		(permission: AgencyPermission) =>
			agencyCan(subRole, permission, modulePermissions, activeOrgId),
		[subRole, modulePermissions, activeOrgId],
	);
}

/** `can("logSales")` for the signed-in outlet operator. */
export function useOutletCan(): (permission: OutletPermission) => boolean {
	const subRole = useStore((s) => s.outletSubRole);
	const modulePermissions = useModulePermissions();
	const activeOrgId = useActiveOrgId();
	return useCallback(
		(permission: OutletPermission) =>
			outletCan(subRole, permission, modulePermissions, activeOrgId),
		[subRole, modulePermissions, activeOrgId],
	);
}

/**
 * Same answer for a sub-role handed in as a prop rather than read from the
 * store (`AgencyHomeHubTabs`, `PortalShell`'s nav merge).
 */
export function useAgencyCanFor(
	subRole: AgencySubRole | null,
): (permission: AgencyPermission) => boolean {
	const modulePermissions = useModulePermissions();
	const activeOrgId = useActiveOrgId();
	return useCallback(
		(permission: AgencyPermission) =>
			agencyCan(subRole, permission, modulePermissions, activeOrgId),
		[subRole, modulePermissions, activeOrgId],
	);
}

export function useOutletCanFor(
	subRole: OutletSubRole | null,
): (permission: OutletPermission) => boolean {
	const modulePermissions = useModulePermissions();
	const activeOrgId = useActiveOrgId();
	return useCallback(
		(permission: OutletPermission) =>
			outletCan(subRole, permission, modulePermissions, activeOrgId),
		[subRole, modulePermissions, activeOrgId],
	);
}
