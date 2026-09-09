import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display label for an admin sidebar section or nav item.
 *
 * The nav is a CONFIG (`constants/links.tsx`, composed from `user-types`,
 * `rbac-sections` and `business-sections`), so its titles are plain strings on
 * a record built at module scope — the same shape that kept the plan cards and
 * the shift-metric tiles in English. Keyed on the config's own `key`, which is
 * stable, routed on, and permission-checked against; the label is the only part
 * that moves.
 *
 * Unknown keys fall through to the config's own English title, so an entry
 * added later still renders rather than blanking a nav row.
 *
 * Display only: `key`, `href` and `allowedPermission` are untouched.
 */
const LABELS: Record<string, keyof PortalTranslations["admin"]> = {
	// Section headings
	overview: "navOverview",
	operation: "navOperation",
	service: "navService",
	subscription: "navSubscription",
	security: "navSecurity",

	// Items — the composed `sidebar-*` keys
	"sidebar-dashboard": "navDashboard",
	"sidebar-settings": "navSettings",
	"sidebar-rbac": "navRbac",
	"sidebar-rbac-role": "navRbac",
	"sidebar-rbac-module": "navModules",
	"sidebar-user-management": "navUser",
	"sidebar-user-admin": "navAdmin",
	"sidebar-user-agency": "navPrAgency",
	"sidebar-user-outlet": "navOutlet",
	"sidebar-user-pr": "navPr",
	"sidebar-user-legacy-member": "navLegacyMember",
	"sidebar-team-agency": "navAgencyTeam",
	"sidebar-team-outlet": "navOutletTeam",
	"sidebar-service-requests": "navPlanRequest",
	"sidebar-service-plan-changes": "navPlanChange",
	"sidebar-service-plan-payment": "navPlanPayment",
	"sidebar-service-payment-voucher": "navPaymentVouchers",
	"sidebar-business-plan": "navPlan",
	"sidebar-business-history": "navCurrentPlan",
	"sidebar-audit-log": "navAuditLog",
};

export function adminNavLabel(
	key: string,
	fallback: string,
	t: PortalTranslations,
): string {
	const hit = LABELS[key];
	return hit ? t.admin[hit] : fallback;
}

/**
 * Blurb under a user-management page title. Keyed on the `userTypes` config's
 * own `key`; the title itself comes from `adminNavLabel("sidebar-user-<key>")`.
 * Unknown keys fall through to the config's English description.
 */
const USER_TYPE_DESCRIPTIONS: Record<
	string,
	keyof PortalTranslations["admin"]
> = {
	admin: "descAdmin",
	agency: "descAgency",
	outlet: "descOutlet",
	pr: "descPr",
	"legacy-member": "descLegacyMember",
};

export function userTypeDescription(
	key: string,
	fallback: string,
	t: PortalTranslations,
): string {
	const hit = USER_TYPE_DESCRIPTIONS[key];
	return hit ? t.admin[hit] : fallback;
}
