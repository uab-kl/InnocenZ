import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display labels for the RBAC screens' stored values.
 *
 * All three take the RAW value the API returned and fall through to it when
 * unrecognised — a portal or status added server-side keeps rendering rather
 * than blanking a row. Display only: nothing here is compared, filtered on, or
 * sent back. `PORTAL_GROUPS`, `statusColors` and every query param stay keyed
 * on the stored code.
 *
 * Note what is deliberately ABSENT: `roleName` and `moduleName`. Those are
 * records the admin creates and edits by name on these very screens, so
 * translating them would show one string in the list and a different one in
 * the field that saves it.
 */
const PORTALS: Record<string, keyof PortalTranslations["rbac"]> = {
	admin: "portalAdmin",
	agency: "portalAgency",
	outlet: "portalOutlet",
	none: "portalNone",
};

export function portalCodeLabel(
	code: string | null | undefined,
	t: PortalTranslations,
): string {
	if (!code) return t.rbac.portalNone;
	const hit = PORTALS[code.toLowerCase()];
	return hit ? t.rbac[hit] : code;
}

/**
 * `active` / `inactive` as any admin record list renders them — RBAC roles and
 * modules, and the admin-users table, all store the same two values.
 */
export function recordStatusLabel(
	status: string,
	t: PortalTranslations,
): string {
	if (status === "active") return t.rbac.statusActive;
	if (status === "inactive") return t.rbac.statusInactive;
	return status;
}

/**
 * Title and blurb for a tab in `rbacSections`, keyed on the config's own
 * stable `key` — the same shape as `adminNavLabel`. `href` and `icon` are
 * untouched.
 */
export function rbacSectionLabel(
	key: string,
	fallback: string,
	t: PortalTranslations,
): string {
	if (key === "role") return t.rbac.sectionRbacTitle;
	if (key === "module") return t.rbac.sectionModulesTitle;
	return fallback;
}
