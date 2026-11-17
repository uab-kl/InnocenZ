/**
 * ONE colour code for every status word the admin console puts on screen.
 *
 * The owner's rule (23 Aug 2026) reads green = settled, amber = waiting,
 * red = disputed, grey = off. An account or organisation is not money, so the
 * same four tones are stated here in the words that fit a record, and the
 * console says them out loud in the status legend rather than leaving the
 * reader to guess:
 *
 *   safe     green   Working. Nothing is being asked of you.
 *   caution  amber   Waiting on a decision — someone has to act.
 *   warning  red     Stopped or refused. Needs attention.
 *   neutral  grey    Switched off. Not in use, and nothing is wrong.
 *
 * ⚠️ This is the ONLY place a status becomes a colour. `statusColors` in
 * `lib/utils.ts` and `orgStatusBadgeColors` in `components/organization/
 * org-status.ts` both read it, because they used to be two hand-written maps
 * that knew different words: `statusColors` held active and inactive ONLY and
 * was read as `statusColors[status]` with no fallback in the RBAC tables, so
 * any third value would render a badge with no colour class at all.
 *
 * An unknown status resolves to `neutral` rather than throwing or blanking —
 * a state added server-side must keep rendering.
 */
export type StatusTone = "safe" | "caution" | "warning" | "neutral";

export const STATUS_TONES: StatusTone[] = [
	"safe",
	"caution",
	"warning",
	"neutral",
];

/** Badge surface: border + fill + text, in one class string. */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
	safe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	caution:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	warning: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
	neutral: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

/**
 * The dot that leads the pill. Solid, so the tone reads at a glance even where
 * the tinted background is faint. `StatusPill` also gives each tone its own
 * SHAPE, so colour is never the only thing carrying the meaning.
 */
export const STATUS_TONE_DOT: Record<StatusTone, string> = {
	safe: "bg-emerald-500",
	caution: "bg-amber-500",
	warning: "bg-rose-500",
	neutral: "bg-muted-foreground/60",
};

/**
 * Every status value the console stores, mapped to its tone.
 *
 * Keys are the RAW stored codes, lower-cased — never a label. The three
 * vocabularies that reach here are organisation status (`agency.status` /
 * `outlet.status`), membership status (`agency_user` / `outlet_user`) and
 * account status (`user.status`); they share values without sharing meanings,
 * and every shared value wants the same tone.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
	// Working.
	active: "safe",
	approved: "safe",
	verified: "safe",
	paid: "safe",
	// Waiting on a decision.
	pending: "caution",
	pending_review: "caution",
	awaiting: "caution",
	submitted: "caution",
	// Stopped or refused.
	suspended: "warning",
	blocked: "warning",
	rejected: "warning",
	declined: "warning",
	disputed: "warning",
	// Switched off.
	inactive: "neutral",
	ended: "neutral",
	expired: "neutral",
	cancelled: "neutral",
	draft: "neutral",
};

export function statusTone(status: string | null | undefined): StatusTone {
	return TONE_BY_STATUS[(status ?? "").toLowerCase().trim()] ?? "neutral";
}

/** The badge class for a stored status, never `undefined`. */
export function statusToneClass(status: string | null | undefined): string {
	return STATUS_TONE_CLASS[statusTone(status)];
}
