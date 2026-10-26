/**
 * MAY THIS PORTAL RENDER WITHOUT ASKING WHICH ORGANISATION?
 *
 * The chooser (`/choose-organisation`) is the only place an organisation is
 * picked, and the portal layouts used to trust that it had been. They never
 * checked. With no active organisation in this tab `axios-v1` sends no
 * `x-org-id`, the server falls back to its own pick, and an account holding
 * BOTH an agency and a venue was shown the AGENCY's invoices under the venue's
 * name.
 *
 * The rule is the chooser's own, not a second spelling of it:
 *
 *  * `shouldChooseOrganisation` false — one place to be, so nothing to ask.
 *    Single-organisation accounts render exactly as they always did; the
 *    server's single-membership fallback is the right answer for them.
 *  * otherwise the tab must hold a choice that is (a) about THIS portal and
 *    (b) one of the account's own ENTERABLE organisations of that kind. A
 *    missing choice, an agency id on the venue console, or a membership since
 *    deactivated all send the person to the chooser rather than letting the
 *    server guess.
 *
 * An empty organisation list is "could not be read" (an older server, a PR or
 * an admin — see the chooser), and falls through to the old behaviour rather
 * than inventing a lock-out.
 */
import type { ActiveOrg } from "@/lib/active-org";
import type { User } from "@/lib/auth";
import { shouldChooseOrganisation } from "@/lib/auth/enter-organisation";
import { portalOfPath } from "@/lib/auth/portal-of-path";
import { deLocalizeHref } from "@/paraglide/runtime";

export function needsOrganisationChoice(
	profile: User,
	portal: "agency" | "outlet",
	active: ActiveOrg | null,
): boolean {
	const orgs = profile.organisations ?? [];
	if (orgs.length === 0) return false;
	if (!shouldChooseOrganisation({ ...profile, organisations: orgs })) {
		return false;
	}
	if (!active || active.kind !== portal) return true;
	return !orgs.some(
		(o) => o.kind === portal && o.id === active.id && o.enterable,
	);
}

/**
 * The chooser, carrying where the person was heading — but only a path that
 * belongs to a portal, the same shape `login.tsx` hands it. `enterOrganisation`
 * then replays it only into the portal it belongs to (`nextForPortal`).
 * Unlocalized on purpose: `hardNavigate` adds the locale prefix.
 */
export function organisationChooserHref(path: string | null): string {
	return path && portalOfPath(path)
		? `/choose-organisation?next=${encodeURIComponent(path)}`
		: "/choose-organisation";
}

/** The page this tab is on, without its locale prefix — the shape `next` is stored in. */
export function currentAppPath(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return deLocalizeHref(window.location.pathname + window.location.search);
	} catch {
		return null;
	}
}
