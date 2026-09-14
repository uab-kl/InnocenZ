/**
 * WHICH PORTAL DOES AN APP PATH BELONG TO, and may a deep link be replayed
 * into the session about to be opened?
 *
 * Two places carry a `next` through sign-in: the login form, and the
 * organisation chooser. Until 14 Sep 2026 only the first asked this question.
 * `login.tsx` tested `next` against the account's HOME portal and forwarded it
 * to the chooser; `enterOrganisation` then navigated to it unconditionally, so
 * an admin deep link survived into an AGENCY session:
 *
 *   /admin/user-management/legacy-member   (signed out)
 *     -> /login?next=/admin/...            home === admin, so allowed
 *     -> /choose-organisation?next=/admin/...
 *     -> pick "Atlas Agency"               agency session starts
 *     -> hardNavigate("/admin/...")        the admin guard refuses
 *
 * and the person could not enter that agency at all — the deep link bounced
 * them every time, which reads as "choosing an organisation is broken" rather
 * than as a stale link. Reported by the owner, holding admin + one agency +
 * two outlets.
 *
 * The two questions are NOT the same, which is why one test could not cover
 * both. Login asks "does this ACCOUNT hold that portal"; the chooser asks
 * "does the ORGANISATION I just picked live in that portal" — narrower, and
 * only answerable after the pick. Both now come through here so they cannot
 * drift into two spellings of the prefix list again.
 */

/** The three portals a path can belong to. */
export type PortalOfPath = "admin" | "agency" | "outlet";

/**
 * The portal an in-app path opens in, or null for anything else — `/login`,
 * `/no-access`, `/choose-organisation` and the signed-out pages belong to no
 * portal and are never a valid destination to restore.
 *
 * Paths are matched WITHOUT their locale prefix, because that is the shape
 * every `next` is stored in: `hardNavigate` adds `/en` (or `/zh`) at
 * navigation time, so a stored value reads `/agency/pv`, never `/en/agency/pv`.
 * A leading locale segment is tolerated anyway rather than trusted — a `next`
 * captured from `window.location` somewhere would otherwise silently resolve
 * to null and send everyone to a portal home for no visible reason.
 */
export function portalOfPath(
	path: string | null | undefined,
): PortalOfPath | null {
	if (!path || !path.startsWith("/")) return null;
	// Tolerate one leading locale segment, e.g. "/en/agency/pv".
	const bare = path.replace(/^\/[a-z]{2}(?=\/)/, "");
	if (isUnder(bare, "/admin")) return "admin";
	if (isUnder(bare, "/agency")) return "agency";
	if (isUnder(bare, "/outlet")) return "outlet";
	return null;
}

/**
 * A prefix match on whole SEGMENTS, never on characters.
 *
 * `startsWith("/agency")` also matches `/agency-signup` and any future sibling
 * route that merely begins with the word, which would hand a signed-out page
 * to a portal test as though it were a portal page.
 */
function isUnder(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The deep link to restore when opening `portal`, or null to use that portal's
 * own landing page.
 *
 * Null is the safe answer in every doubtful case: a portal home is a page the
 * person can always open, whereas a foreign deep link is a refusal they can
 * neither act on nor escape.
 */
export function nextForPortal(
	next: string | null | undefined,
	portal: PortalOfPath,
): string | null {
	if (!next) return null;
	return portalOfPath(next) === portal ? next : null;
}
