import { adminConsoleRoleName } from "@/lib/auth/console-role";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * The admin console's role, as a LABEL — "Admin" / 管理员.
 *
 * `adminConsoleRoleName` returns the stored spelling, and the canonical role is
 * stored lower-case, so the sidebar's profile line and the Profile page printed
 * "admin" (22 Oct 2026). `portalRoleLabel` translates the five org lanes and
 * passes anything else through untouched, which is right for a role somebody
 * added by hand and wrong for the one role this console is built around.
 *
 * Both spellings — the stored `admin` and the "Admin" stand-in used before the
 * profile loads — resolve to the SAME dictionary entry, so the two cannot
 * disagree in Chinese.
 */
export function adminConsoleRoleLabel(
	roles: readonly string[] | null | undefined,
	t: PortalTranslations,
): string {
	const name = adminConsoleRoleName(roles);
	return name.trim().toLowerCase() === "admin"
		? t.adminProfile.roleAdmin
		: portalRoleLabel(name, t);
}
