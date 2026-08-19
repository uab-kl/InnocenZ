import { normalizedSlotWindow } from "@agency-portal/lib/backend-shift-map";

/**
 * Do two of ONE OUTLET's own shifts collide in time?
 *
 * Nothing used to ask. The Post Job screen checked the tier mix, the named-PR cap
 * and the plan's daily headcount — and a day's headcount is ADDITIVE, so two
 * identical 11:00–12:00 shifts asking for 2 and 3 PRs read as a perfectly legal
 * day of 5. The venue got two records for one night's demand and the agency had to
 * staff them separately.
 *
 * BOTH verdicts are refused — the venue's rule is that its own shifts never overlap
 * (owner, 17 Aug 2026) — and the backend refuses both with a 409, so this is a faster
 * no rather than a different one. They stay separate kinds because the REMEDY differs,
 * and a refusal that names the wrong remedy is barely better than no message:
 *   • `duplicate` — the same time said twice. Wants a bigger headcount on the shift
 *     that already exists.
 *   • `overlap` — times that cross. Wants a different clock.
 *
 * ⚠️ BACK-TO-BACK IS ALLOWED, and the strict intersection below is what allows it. It
 * was refused here for one revision; the rule belongs on the PERSON who would have to
 * travel, not on the venue, which may well staff 11:00–12:00 and 12:00–13:00 with two
 * different people.
 *
 * This is the outlet-demand mirror of the backend's PR double-booking guard, and
 * it is built the same way on purpose: an absolute-minute timeline, so an overnight
 * 22:00–04:00 shift meets the next morning's 02:00–06:00. A same-date test would
 * never compare them, and overnight is the normal shape in this business.
 */

/** A shift in the shape both the demo store and the backend list already expose. */
export interface ClashCandidate {
	/** Canonical yyyy-MM-dd. */
	dateIso: string;
	/** The slot as stored: "22:00 - 04:00", "10:00 PM - 4:00 AM", or a label. */
	shift: string;
	/** Display only — what the warning calls the other shift. */
	event?: string;
}

export type SlotClashKind = "duplicate" | "overlap";

export interface SlotClash {
	kind: SlotClashKind;
	/** The shift being posted. */
	posting: ClashCandidate;
	/** What it collides with — already booked, or later in the same batch. */
	against: ClashCandidate;
}

const MINUTES_PER_DAY = 24 * 60;

/** Which clash to report when a shift collides with more than one thing. */
const SEVERITY: Record<SlotClashKind, number> = {
	duplicate: 2,
	overlap: 1,
};

function minutesOfHhmm(hhmm: string): number | null {
	const [h, m] = hhmm.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return h * 60 + m;
}

/** Whole days since epoch — the offset that puts two dates on one timeline. */
function dayIndex(dateIso: string): number | null {
	const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
	if (!y || !m || !d) return null;
	return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * A shift's window in absolute minutes. Parsing goes through
 * `normalizedSlotWindow` rather than a private regex: the slot is free text, the
 * composer writes "22:00 - 04:00" and the backend stores whatever was typed, and a
 * second parser here would eventually disagree with the one the calendar renders.
 *
 * Null for a label-only slot ("Late night") — no window, nothing to intersect.
 */
export function windowMinutes(
	candidate: ClashCandidate,
): { start: number; end: number } | null {
	const parsed = normalizedSlotWindow(candidate.shift);
	const day = dayIndex(candidate.dateIso);
	if (!parsed || day === null) return null;
	const start = minutesOfHhmm(parsed.start);
	const end = minutesOfHhmm(parsed.end);
	if (start === null || end === null) return null;
	const base = day * MINUTES_PER_DAY;
	return {
		start: base + start,
		// An end at or before its start has run past midnight.
		end: base + (end <= start ? end + MINUTES_PER_DAY : end),
	};
}

/** Mirrors the backend's `slotLabelKey` — no case, no stray spacing. */
function labelKey(shift: string): string {
	return shift.trim().replace(/\s+/g, " ").toLowerCase();
}

function clashBetween(
	posting: ClashCandidate,
	against: ClashCandidate,
): SlotClashKind | null {
	const a = windowMinutes(posting);
	const b = windowMinutes(against);
	if (a && b) {
		if (a.start === b.start && a.end === b.end) return "duplicate";
		// STRICT intersection: a shared boundary is not a crossing, so 11:00–12:00 and
		// 12:00–13:00 pass. Deliberate — see the note above.
		return a.start < b.end && b.start < a.end ? "overlap" : null;
	}
	// A window and a label may well mean the same night, but nothing here can
	// know that — only two labels compare, and only as words on the same date.
	if (a || b) return null;
	const key = labelKey(posting.shift);
	return key !== "" &&
		key === labelKey(against.shift) &&
		posting.dateIso.slice(0, 10) === against.dateIso.slice(0, 10)
		? "duplicate"
		: null;
}

/**
 * At most one clash per shift being posted, and the WORST one: a duplicate outranks
 * an overlap. Ranking matters because both are refused — whichever is reported is the
 * only advice the operator gets, and "you already have this shift" is more use than
 * "these two cross" when both are true of the same evening.
 *
 * `posting` items are compared against `existing` AND against each other — pressing
 * "Add another shift" twice with the same time produces two separate POSTs, so
 * neither request could ever have seen the other.
 */
export function findSlotClashes(
	posting: ClashCandidate[],
	existing: ClashCandidate[],
): SlotClash[] {
	const clashes: SlotClash[] = [];
	for (let i = 0; i < posting.length; i++) {
		const candidate = posting[i];
		const others = [...existing, ...posting.slice(i + 1)];
		let worst: SlotClash | null = null;
		for (const other of others) {
			const kind = clashBetween(candidate, other);
			if (!kind) continue;
			if (!worst || SEVERITY[kind] > SEVERITY[worst.kind]) {
				worst = { kind, posting: candidate, against: other };
			}
			if (kind === "duplicate") break;
		}
		if (worst) clashes.push(worst);
	}
	return clashes;
}

/** `11:00 - 12:00 on 2026-08-17 ("Friday lounge")` — the other half of a clash. */
export function describeClashShift(candidate: ClashCandidate): string {
	const named = candidate.event?.trim() ? ` ("${candidate.event.trim()}")` : "";
	return `${candidate.shift} on ${candidate.dateIso.slice(0, 10)}${named}`;
}
