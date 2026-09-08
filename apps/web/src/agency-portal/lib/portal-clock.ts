/**
 * The portals' wall clock — the one place "Tue, 8 Sept 2026 · 12:55 pm" is made.
 *
 * ⚠️ MOVED OUT OF `agency-demo.ts` (8 Sep 2026), and the move is the point. This
 * is a pure date formatter with nothing demo about it, but it lived inside a
 * 2,300-line module of seed rosters and fixture PRs — so every page that wanted
 * the time imported the whole demo store to get it, and the shared `iz/ui`
 * components could not use it at all without risking the circular import that
 * once took the entire agency portal down.
 *
 * Keep this file a LEAF: no imports, no state, nothing but the clock.
 */

/**
 * Today's date and time, formatted for the Malaysian portals.
 *
 * `en-MY` is deliberate and not a stand-in for the UI locale: this is a venue
 * operations clock, and the agency, the outlet and the PR must read the same
 * wall time when they are arguing about when a shift started.
 */
export function nowAgencyDateTime() {
	const d = new Date();
	return {
		date: d.toLocaleDateString("en-MY", {
			weekday: "short",
			day: "numeric",
			month: "short",
			year: "numeric",
		}),
		time: d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }),
	};
}
