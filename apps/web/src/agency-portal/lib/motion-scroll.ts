/**
 * How far a scroll the USER asked for should glide — a click on a KPI, a
 * "jump to" link, a deep link landing on its row.
 *
 * An explicit `scrollIntoView({ behavior: "smooth" })` asks for a glide
 * whatever the reader's reduced-motion setting says. This is the rule the
 * back-to-top button in `PortalDesignChrome.tsx` already follows, in one place:
 * jump at once under `prefers-reduced-motion: reduce`, glide otherwise.
 *
 * A runtime with no `matchMedia` (jsdom, server render) gets "smooth", the
 * same answer as a browser whose reader never set the preference.
 */
export function portalScrollBehavior(): ScrollBehavior {
	return typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
		? "instant"
		: "smooth";
}
