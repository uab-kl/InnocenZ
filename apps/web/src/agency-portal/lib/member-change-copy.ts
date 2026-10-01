/**
 * THE SERVER'S MEMBER-CHANGE SENTENCES, IN THE READER'S LANGUAGE.
 *
 * `PUT` / `DELETE /:org/:id/members/:memberId` answer with a sentence that says
 * what the write did, and the Team screen and the Approvals pane show it as the
 * confirmation (the owner's rule: every action confirms in the server's words).
 * Those sentences are English, so a 中文 operator approved a member and read
 * the confirmation in a language they had not chosen.
 *
 * Sentences read from apps/backend/src/features/rbac/member-change-message.ts
 * on 29 Sep 2026 — the only producer of them:
 *
 *   memberUpdateMessage   "Member reactivated as {role}."
 *                         "Request approved — they join as {role}."
 *                         "Member deactivated — they no longer have access."
 *                         "Role changed to {role}."
 *                         "Member updated"
 *   memberRemovalMessage  "Request declined — they were not added to the team."
 *                         "Member deactivated — they no longer have access."
 *
 * {role} is `portalRoleName` ('Owner', 'Finance', 'Ops Head', 'Director',
 * 'Guarantor'), translated through the same `portalRoleLabel` the pickers use —
 * which passes an unrecognised role through as the server wrote it.
 *
 * The same shape as `prWriteRefusalText`: the wire stays English, the render
 * translates, compared without a trailing full stop. A sentence this map does
 * not know is shown as the server wrote it — never swallowed, never replaced by
 * a generic "Saved".
 */
import { fill } from "@/lib/portal-i18n/fill";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type Rule = {
	pattern: RegExp;
	render: (t: PortalTranslations, match: RegExpExecArray) => string;
};

const role = (t: PortalTranslations, match: RegExpExecArray) =>
	portalRoleLabel(match[1] ?? "", t);

/** Exported for the test, which checks it against the backend's own list. */
export const MEMBER_CHANGE_RULES: readonly Rule[] = [
	{
		pattern: /^Member reactivated as (.+)$/,
		render: (t, m) =>
			fill(t.portalUi.serverMemberReactivatedAs, { role: role(t, m) }),
	},
	{
		pattern: /^Request approved — they join as (.+)$/,
		render: (t, m) =>
			fill(t.portalUi.serverRequestApprovedAs, { role: role(t, m) }),
	},
	{
		pattern: /^Member deactivated — they no longer have access$/,
		render: (t) => t.portalUi.serverMemberDeactivated,
	},
	{
		pattern: /^Role changed to (.+)$/,
		render: (t, m) =>
			fill(t.portalUi.serverRoleChangedTo, { role: role(t, m) }),
	},
	{
		pattern: /^Member updated$/,
		render: (t) => t.portalUi.serverMemberUpdated,
	},
	{
		pattern: /^Request declined — they were not added to the team$/,
		render: (t) => t.portalUi.serverRequestDeclined,
	},
];

/** One member-change sentence in the reader's language; unknown ones verbatim. */
export function localiseMemberChangeMessage(
	message: string,
	t: PortalTranslations,
): string {
	const key = message.trim().replace(/\.$/, "");
	for (const rule of MEMBER_CHANGE_RULES) {
		const match = rule.pattern.exec(key);
		if (match) return rule.render(t, match);
	}
	return message;
}

/** The sentence to confirm with — the server's, translated — or `fallback` when it sent none. */
export function memberChangeText(
	message: string | null | undefined,
	t: PortalTranslations,
	fallback: string,
): string {
	const trimmed = message?.trim();
	return trimmed ? localiseMemberChangeMessage(trimmed, t) : fallback;
}
