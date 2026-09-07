import type { NavAlertMap } from "@agency-portal/lib/portal-nav-alerts";
import { createContext, useContext } from "react";

/**
 * A LEAF module: the context and the badge that reads it, and nothing else.
 *
 * `Nav.tsx` and `PortalShell.tsx` both draw a badge, and the counts behind one
 * come from `PortalNavAlerts.tsx`, which imports half a dozen data hooks. Had
 * the context lived there, `Nav.tsx` would import that whole graph to draw a
 * pill — and this app has already lost the entire agency portal once to a
 * latent import cycle that only bit when `tsr generate` re-ordered the route
 * imports (see the import-cycle memory). A leaf that imports React and one pure
 * module cannot take part in a cycle.
 */
const NO_ALERTS: NavAlertMap = Object.freeze({});

export const NavAlertContext = createContext<NavAlertMap>(NO_ALERTS);

/**
 * What each nav row should badge, keyed by its `to` path.
 *
 * Returns `{}` outside a provider rather than throwing. Every nav surface in
 * this app renders in places the provider may not wrap — the mobile tab bar on
 * a route that mounts its own shell, a story, a test — and a rail that renders
 * without its badges is correct; a rail that white-screens is not.
 */
export function useNavAlerts(): NavAlertMap {
	return useContext(NavAlertContext);
}

/**
 * The count pill beside a nav label.
 *
 * `aria-hidden` on the number with the whole thing announced on the LINK
 * instead (see `navAlertAriaSuffix`): a screen reader reading "Payroll" then a
 * bare "7" gives no clue what seven is. Nothing renders at zero — see
 * `portal-nav-alerts.ts` for why an absent badge beats a grey 0.
 */
export function NavAlertBadge({
	count,
	tone,
}: {
	count: number;
	tone: "amber" | "red";
}) {
	if (count <= 0) return null;
	return (
		<span className="iz-nav-alert" data-tone={tone} aria-hidden="true">
			{count > 99 ? "99+" : count}
		</span>
	);
}

/**
 * ", 7 waiting" — appended to a nav item's accessible name.
 *
 * The suffix word is a PARAMETER, not a default: module scope cannot call a
 * hook to read the dictionary, and a hardcoded English fallback here is exactly
 * how a translated portal ends up with one English word in it.
 */
export function navAlertAriaSuffix(
	count: number | undefined,
	waitingWord: string,
): string {
	return count && count > 0 ? `, ${count} ${waitingWord}` : "";
}
