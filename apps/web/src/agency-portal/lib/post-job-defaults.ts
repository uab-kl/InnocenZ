/**
 * The time and headcount a venue LAST POSTED with, so the next shift opens on
 * them instead of the built-in 22:00 - 04:00 / 6.
 *
 * Owner, 2 Sep 2026: "if the outlet already posted a shift the setted time and
 * the people needed will be store and keep same for the next post shift also,
 * untill changes, if changes take the changes to the next. Just to catch the
 * time and the people needed." So deliberately TWO fields and no more — the
 * event name, the dates, the named PRs and the pay-tier split all still start
 * fresh, because those are per-night facts and carrying them forward would post
 * last night's guest list at tonight's shift.
 *
 * KEYED PER OUTLET. A two-venue operator must not carry venue A's 22:00 club
 * night into venue B's lunch service — which is also why the key falls back to
 * the venue NAME rather than a shared constant when there is no outlet id.
 *
 * Saved only on a SUCCESSFUL post. A draft the operator abandoned, or one the
 * server refused, is not something they chose to keep.
 *
 * Deliberately localStorage rather than the backend. This is a convenience for
 * whoever is filling the form, not a fact about the venue: there is no column
 * for it, `shift` exposes no created-at over the API and no sort to find the
 * newest row by, and a stale value costs exactly one edit to fix. The trade,
 * stated rather than hidden: it does not follow the operator to another browser
 * or to a colleague's machine, and a private window forgets it. Moving it to
 * `outlet_workspace` later would change only these two functions.
 *
 * EVERY READ IS VALIDATED. A hand-edited, half-written or older-format value
 * must fall back to the composer's own defaults rather than open the form on
 * nonsense — `quantity: 0` would render a shift nobody can work, and a
 * malformed time would parse to 00:00 - 00:00.
 */

export interface PostJobDefaults {
	/** "HH:MM - HH:MM", 24-hour — the shape `parseShiftTime` reads. */
	shiftTime: string;
	quantity: number;
}

const STORAGE_PREFIX = "innocenz-post-job-defaults";

/** The one shape the composer stores and reads: "21:30 - 02:00". */
const SHIFT_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d - ([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A sanity ceiling, not the business rule. The real limit is the venue's plan
 * cap, which the composer enforces against the live subscription every post;
 * this only stops a corrupt value opening the form on a five-digit headcount.
 */
const MAX_REMEMBERED_QUANTITY = 999;

function storageKey(outletKey: string) {
	return `${STORAGE_PREFIX}:${outletKey.trim().toLowerCase() || "outlet"}`;
}

/**
 * What the next composer should open on, or null when this venue has posted
 * nothing yet (or the stored value no longer makes sense). Null rather than a
 * default pair on purpose: the caller passes it straight to `newDraftShift`,
 * whose own defaults are the single source of "what a fresh shift looks like".
 */
export function loadPostJobDefaults(
	outletKey: string,
): Partial<PostJobDefaults> | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(storageKey(outletKey));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<PostJobDefaults>;
		const shiftTime =
			typeof parsed.shiftTime === "string" &&
			SHIFT_TIME_RE.test(parsed.shiftTime)
				? parsed.shiftTime
				: null;
		const quantity =
			typeof parsed.quantity === "number" &&
			Number.isInteger(parsed.quantity) &&
			parsed.quantity > 0 &&
			parsed.quantity <= MAX_REMEMBERED_QUANTITY
				? parsed.quantity
				: null;
		// One bad field does not discard the other: a venue that always works the
		// same hours keeps them even if the headcount was written badly.
		if (shiftTime === null && quantity === null) return null;
		return {
			...(shiftTime === null ? {} : { shiftTime }),
			...(quantity === null ? {} : { quantity }),
		};
	} catch {
		// A private window, cleared site data, or a browser blocking storage.
		return null;
	}
}

/** Remember what was just posted. Silent on failure — a full quota must not break a post. */
export function savePostJobDefaults(
	outletKey: string,
	defaults: PostJobDefaults,
) {
	if (typeof window === "undefined") return;
	if (!SHIFT_TIME_RE.test(defaults.shiftTime)) return;
	if (
		!Number.isInteger(defaults.quantity) ||
		defaults.quantity <= 0 ||
		defaults.quantity > MAX_REMEMBERED_QUANTITY
	) {
		return;
	}
	try {
		localStorage.setItem(storageKey(outletKey), JSON.stringify(defaults));
	} catch {
		/* ignore quota */
	}
}
