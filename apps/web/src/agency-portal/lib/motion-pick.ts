/**
 * "WHAT DID I JUST PICK" — the one piece of motion that needs a script.
 *
 * portal-motion.css plays the tab halo (M5), the fade of what a tab swaps in
 * (M5) and the settle of a rail section the user opens (M2) only while the
 * strip or heading carries `data-iz-picked`. This module sets that attribute
 * for a moment after a CLICK, and nothing else does.
 *
 * Why not CSS `:focus`: it was tried and measured. `:focus` stops matching when
 * the window loses focus and matches again when the user comes back, so every
 * return to the browser tab replayed the halo and re-faded the voucher list —
 * at the same moment react-query refetches on window focus, which reads as
 * "the page reloaded". Safari also never focuses a clicked button. A click is
 * the only signal that means "the user picked this", and keyboard Enter/Space
 * on a button fire one too.
 *
 * The attribute is presentation only: no state reads it, nothing waits on it,
 * and React never renders it, so a re-render neither adds nor strips it.
 */

export const PICK_ATTR = "data-iz-picked";

/**
 * How long a pick stays marked. Longer than the longest motion it gates
 * (the 400ms halo), so removing the mark never cuts a motion short.
 */
export const PICK_MS = 700;

/**
 * The element a pick marks: the tab STRIP (its tabs halo, its following
 * siblings fade). The same strips as styles/portal-tabs.css and M5.
 */
const PICK_STRIPS = [
	".iz-payroll-tabs",
	".iz-approvals-groups",
	".iz-approvals-subfilter",
	".iz-approvals-doc-tabs",
	".iz-event-picker__tabs",
	".iz-roster-toggle",
	".iz-agency-home-tabs",
	".iz-agency-settings-tabs",
	".iz-outlet-settings-tabs",
	".iz-outlet-report-tabs",
	'[role="tablist"]',
].join(", ");

/** Tabs that sit in a strip with no class of its own: mark their parent. */
const LOOSE_TABS = [
	".iz-payroll-tab",
	".iz-filter-chip",
	".iz-approvals-tab",
	".iz-post-job-event-type-pill",
].join(", ");

/** A rail section heading the user opens or closes: it marks itself. */
const RAIL_HEADING = ".iz-portal-sidebar .iz-outlet-nav-heading";

/** What a click on `target` should mark, or null when it is not a pick. */
export function pickRootFor(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	const control = target.closest<HTMLElement>("button, [role='tab']");
	if (!control) return null;
	if (control.matches(":disabled, [aria-disabled='true']")) return null;
	if (control.matches(RAIL_HEADING)) return control;
	const strip = control.closest<HTMLElement>(PICK_STRIPS);
	if (strip) return strip;
	if (control.matches(LOOSE_TABS)) return control.parentElement;
	return null;
}

/**
 * Mark `root` as just picked. A second pick inside the window drops the mark,
 * forces a style pass and sets it again, so the motion replays for every pick
 * instead of only the first.
 */
export function markPick(
	root: HTMLElement,
	timers: Map<HTMLElement, ReturnType<typeof setTimeout>>,
): void {
	const pending = timers.get(root);
	if (pending !== undefined) clearTimeout(pending);
	root.removeAttribute(PICK_ATTR);
	// Reading layout flushes styles, so the animation ends before it restarts.
	void root.offsetWidth;
	root.setAttribute(PICK_ATTR, "");
	timers.set(
		root,
		setTimeout(() => {
			root.removeAttribute(PICK_ATTR);
			timers.delete(root);
		}, PICK_MS),
	);
}

/**
 * Listen for picks anywhere in the document, in the CAPTURE phase so the mark
 * is set before React's own click handler swaps the content. Returns the
 * cleanup for a useEffect.
 */
export function listenForPicks(doc: Document = document): () => void {
	const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
	const onClick = (event: MouseEvent) => {
		const root = pickRootFor(event.target);
		if (root) markPick(root, timers);
	};
	doc.addEventListener("click", onClick, true);
	return () => {
		doc.removeEventListener("click", onClick, true);
		for (const [root, timer] of timers) {
			clearTimeout(timer);
			root.removeAttribute(PICK_ATTR);
		}
		timers.clear();
	};
}
