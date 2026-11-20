/**
 * AN INVITATION SURVIVES THE SIGN-IN IT ASKS FOR — for every role (owner, 19 Nov
 * 2026: "i sign in still can't see any other organisation and the invitation …
 * fix this … for any user pr , agency , outlet ,admin or any role").
 *
 * The invite page (`routes/invite/org-member.tsx`) tells a signed-out invitee to
 * sign in, and accepting needs a session. Its "Sign in to accept" button used to
 * hand the login page only the email, so the sign-in landed on the person's own
 * home — an admin on the dashboard — and the invitation was never accepted: no
 * membership, so no organisation to choose. The login page's own `next` rule
 * could not have helped either: it honours only a PORTAL path, and the invite
 * page belongs to no portal.
 *
 * This is the one non-portal page a sign-in may return to. Only the exact shape
 * the invite page builds is accepted — a same-site path, one `token` of URL-safe
 * characters, nothing after it — so the login page cannot be turned into a
 * redirect to anywhere else.
 */

const INVITE_PATH = "/invite/org-member";
const INVITE_RETURN = /^\/invite\/org-member\?token=[A-Za-z0-9_-]{16,256}$/;

/** The unlocalized path back to this invitation (`hardNavigate` adds the locale). */
export function inviteReturnPath(token: string): string {
	return `${INVITE_PATH}?token=${encodeURIComponent(token.trim())}`;
}

/** Is `path` exactly an invitation the invite page sent here — and nothing else? */
export function isInviteReturnPath(
	path: string | null | undefined,
): path is string {
	return typeof path === "string" && INVITE_RETURN.test(path);
}
