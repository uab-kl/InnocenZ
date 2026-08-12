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

/** `can("managePr")` for the signed-in agency operator. */
export function useAgencyCan(): (permission: AgencyPermission) => boolean {
	const subRole = useStore((s) => s.agencySubRole);
	const modulePermissions = useModulePermissions();
	return useCallback(
		(permission: AgencyPermission) =>
			agencyCan(subRole, permission, modulePermissions),
		[subRole, modulePermissions],
	);
}

/** `can("logSales")` for the signed-in outlet operator. */
export function useOutletCan(): (permission: OutletPermission) => boolean {
	const subRole = useStore((s) => s.outletSubRole);
	const modulePermissions = useModulePermissions();
	return useCallback(
		(permission: OutletPermission) =>
			outletCan(subRole, permission, modulePermissions),
		[subRole, modulePermissions],
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
	return useCallback(
		(permission: AgencyPermission) =>
			agencyCan(subRole, permission, modulePermissions),
		[subRole, modulePermissions],
	);
}

export function useOutletCanFor(
	subRole: OutletSubRole | null,
): (permission: OutletPermission) => boolean {
	const modulePermissions = useModulePermissions();
	return useCallback(
		(permission: OutletPermission) =>
			outletCan(subRole, permission, modulePermissions),
		[subRole, modulePermissions],
	);
}
