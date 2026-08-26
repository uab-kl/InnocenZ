import { DEFAULT_AGENCY_OWNER } from "@agency-portal/lib/agency-demo";
import {
	type AgencySubRole,
	getAgencyDefaultRoute,
} from "@agency-portal/lib/agency-rbac";
import { DEFAULT_OUTLET_OWNER } from "@agency-portal/lib/outlet-demo";
import {
	getOutletDefaultRoute,
	type OutletSubRole,
} from "@agency-portal/lib/outlet-rbac";
import type { PrSubRole } from "@agency-portal/lib/pr-demo";
import type { Role } from "@agency-portal/lib/store";

export type SignInPortal = "pr" | "outlet" | "agency";

export type PortalSubRoleItem = {
	/**
	 * The ENGLISH sub-role name — a stable key, not display copy.
	 *
	 * It is what `portalRoleLabel` (lib/portal-i18n/portal-role-label.ts) and
	 * `SUB_ROLE_TITLE_ICONS` both match on, so it must stay English here. A
	 * sign-in screen renders it as `portalRoleLabel(item.label, t)`; translating
	 * the constant instead would break the icon lookup silently and put a second
	 * source of truth beside `profile.roleOwner` / `roleFinance` / `roleOps`.
	 */
	label: string;
	role: Role;
	outletSubRole?: OutletSubRole;
	agencySubRole?: AgencySubRole;
	prSubRole?: PrSubRole;
};

export const OUTLET_SIGNIN_SUB_ROLES: PortalSubRoleItem[] = [
	{ label: "Owner", role: "vendor", outletSubRole: "outlet_owner" },
	{ label: "Finance", role: "vendor", outletSubRole: "outlet_finance" },
	{ label: "Operations Head", role: "vendor", outletSubRole: "outlet_ops" },
];

export const AGENCY_SIGNIN_SUB_ROLES: PortalSubRoleItem[] = [
	{ label: "Owner", role: "agency", agencySubRole: "agency_owner" },
	{ label: "Finance", role: "agency", agencySubRole: "agency_finance" },
];

export function parseSignInPortal(value: unknown): SignInPortal {
	if (value === "outlet" || value === "agency") return value;
	return "pr";
}

export function portalHomePath(
	portal: SignInPortal,
	item?: PortalSubRoleItem,
): string {
	if (portal === "outlet") {
		return getOutletDefaultRoute(item?.outletSubRole ?? "outlet_owner");
	}
	if (portal === "agency") {
		return getAgencyDefaultRoute(item?.agencySubRole ?? "agency_owner");
	}
	return "/host";
}

export function subRolesForPortal(portal: SignInPortal): PortalSubRoleItem[] {
	if (portal === "outlet") return OUTLET_SIGNIN_SUB_ROLES;
	if (portal === "agency") return AGENCY_SIGNIN_SUB_ROLES;
	return [];
}

export function portalUsesEmailSignIn(portal: SignInPortal): boolean {
	return portal === "outlet" || portal === "agency";
}

export function defaultSignInIdentifier(portal: SignInPortal): string {
	if (portal === "outlet") return DEFAULT_OUTLET_OWNER.email;
	if (portal === "agency") return DEFAULT_AGENCY_OWNER.email;
	return "60123456789";
}

export function resolveSignInEmail(value: string): string | null {
	const email = value.trim();
	if (!email || !email.includes("@")) return null;
	return email;
}

/*
 * `PORTAL_SIGNIN_LABELS` and `PORTAL_AUTH_TAGLINES` were removed here.
 *
 * Both were module-scope English constants, so they were built before any hook
 * could run and could never read the dictionary — which is why the sign-in hero
 * stayed English in a Chinese session. `PortalAuthFrame` was their only reader
 * and now resolves the same copy from `portalUi.portalName*` /
 * `portalUi.portalTagline*` through resolver functions. Keeping the dead
 * constants would leave a second, untranslated copy of that wording to drift
 * against the live keys.
 */
