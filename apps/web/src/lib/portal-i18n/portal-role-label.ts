import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display label for an RBAC role name coming back from the server.
 *
 * The role picker used to render `role.roleName` straight through, so the
 * member and invite dropdowns stayed English in a Chinese session — the backend
 * name won over the dictionary whenever a matching portal role existed, which
 * is nearly always. `Owner` / `Finance` / `Ops Head` are seeded constants
 * (`portalRoleName` in the backend), but `Director` and `Guarantor` are rows
 * somebody added to the live `role` table and exist in no code path here.
 *
 * Hence: translate what we recognise, PASS THROUGH what we do not. A role name
 * this map has never seen still has to reach the screen — an operator reading
 * one lane in English can still pick it, whereas a blank or a dictionary key
 * makes the whole dropdown unusable.
 *
 * Display only. The stored `role_name`, the `roleId` sent on invite and the
 * `subRole` sent on a role change are all untouched.
 */
export function portalRoleLabel(
	roleName: string,
	t: PortalTranslations,
): string {
	const n = roleName
		.trim()
		.toLowerCase()
		.replace(/[_\s]+/g, " ");
	if (n === "owner") return t.profile.roleOwner;
	if (n === "finance") return t.profile.roleFinance;
	if (n === "ops head" || n === "ops" || n === "operations head")
		return t.profile.roleOps;
	if (n === "director") return t.profile.roleDirector;
	if (n === "guarantor") return t.profile.roleGuarantor;
	return roleName.replace(/_/g, " ");
}
