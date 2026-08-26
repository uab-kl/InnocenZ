import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display copy for the five audit-log role tabs.
 *
 * `auditLogRoles` in `@/constants/audit-log-roles` carries the `key`, the route
 * `slug` and the icon — all of which are DATA (the key is sent to the API as
 * `role`, the slug is the URL). Only its `label` and `description` are chrome,
 * so those two are resolved here instead of being translated in place; the
 * stored key keeps addressing the row.
 *
 * The map holds FUNCTIONS rather than key names, because a module-scope object
 * cannot read `t`. Both resolvers fall through to the English value shipped in
 * the constants file, so a sixth role added there keeps rendering instead of
 * blanking a card.
 *
 * Nothing here touches the RECORDED action, entity or role on a log row. An
 * audit log has to reproduce what was written, so those stay English.
 */
const ROLE_COPY: Record<
	string,
	{
		label: (t: PortalTranslations) => string;
		description: (t: PortalTranslations) => string;
	}
> = {
	admin: {
		label: (t) => t.adminAudit.roleAdmin,
		description: (t) => t.adminAudit.roleAdminHint,
	},
	pr: {
		label: (t) => t.adminAudit.rolePr,
		description: (t) => t.adminAudit.rolePrHint,
	},
	outlet: {
		label: (t) => t.adminAudit.roleOutlet,
		description: (t) => t.adminAudit.roleOutletHint,
	},
	agency: {
		label: (t) => t.adminAudit.roleAgency,
		description: (t) => t.adminAudit.roleAgencyHint,
	},
	others: {
		label: (t) => t.adminAudit.roleOthers,
		description: (t) => t.adminAudit.roleOthersHint,
	},
};

export function auditLogRoleLabel(
	key: string,
	fallback: string,
	t: PortalTranslations,
): string {
	const hit = ROLE_COPY[key];
	return hit ? hit.label(t) : fallback;
}

export function auditLogRoleDescription(
	key: string,
	fallback: string,
	t: PortalTranslations,
): string {
	const hit = ROLE_COPY[key];
	return hit ? hit.description(t) : fallback;
}
