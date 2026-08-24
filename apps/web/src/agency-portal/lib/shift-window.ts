/**
 * When does a shift actually END?
 *
 * `shift.slot` carries the time range as text ("22:00 - 04:00"); there are no
 * start/end columns. Every one of the 40 rows in the live table matches that
 * shape, and **21 of them cross midnight** — so the overnight case is the
 * majority here, not an edge case.
 *
 * That is the whole reason this lives in its own module with tests: comparing
 * the end TIME against the clock is wrong for exactly those 21 rows. A shift
 * running 22:00 - 04:00 would look like it ended at 04:00 on the morning it
 * started, and get hidden while it is still on the floor. The end has to be an
 * INSTANT — the shift's date plus the end time, carried into the next day
 * whenever the end is not after the start.
 */

/** Start and end of a slot, in minutes past the START day's midnight. */
export interface SlotRange {
	startMin: number;
	/** Exceeds 1440 for an overnight shift — it is deliberately not wrapped. */
	endMin: number;
}

const SLOT_RE = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse `"HH:MM - HH:MM"`. Returns `null` for anything else — a named slot, an
 * empty string, or a malformed time. Callers must treat `null` as "unknown",
 * never as "ended".
 */
export function parseSlotRange(
	slot: string | null | undefined,
): SlotRange | null {
	if (!slot) return null;
	const m = SLOT_RE.exec(slot);
	if (!m) return null;

	const sh = Number(m[1]);
	const sm = Number(m[2]);
	const eh = Number(m[3]);
	const em = Number(m[4]);
	if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;

	const startMin = sh * 60 + sm;
	const rawEndMin = eh * 60 + em;
	// Ends at or before it starts => it runs past midnight into the next day.
	// A 22:00 - 22:00 slot reads the same way: a full 24 hours, not zero.
	const endMin = rawEndMin > startMin ? rawEndMin : rawEndMin + MINUTES_PER_DAY;
	return { startMin, endMin };
}

/**
 * The instant a shift finishes, in the viewer's local zone — which is the
 * venue's zone in practice. `null` when the slot is not a time range.
 */
export function shiftEndInstant(
	shiftDate: string | null | undefined,
	slot: string | null | undefined,
): Date | null {
	const range = parseSlotRange(slot);
	if (!range || !shiftDate) return null;

	const [y, m, d] = shiftDate.slice(0, 10).split("-").map(Number);
	if (!y || !m || !d) return null;

	// Minutes go through the Date constructor so an overnight end rolls the
	// calendar day over for us — including across month and year boundaries.
	return new Date(y, m - 1, d, 0, range.endMin, 0, 0);
}

/**
 * The instant a shift BEGINS, in the viewer's local zone. `null` when the slot
 * is not a time range.
 */
export function shiftStartInstant(
	shiftDate: string | null | undefined,
	slot: string | null | undefined,
): Date | null {
	const range = parseSlotRange(slot);
	if (!range || !shiftDate) return null;

	const [y, m, d] = shiftDate.slice(0, 10).split("-").map(Number);
	if (!y || !m || !d) return null;
	return new Date(y, m - 1, d, 0, range.startMin, 0, 0);
}

/**
 * Is this shift on the floor RIGHT NOW?
 *
 * Half-open [start, end): a shift is live from the moment it starts until the
 * moment it ends, and `hasShiftEnded` already treats the end instant as over —
 * so the two never both claim the same minute.
 *
 * Fails CLOSED, the opposite of `hasShiftEnded`: an unparseable slot returns
 * `false`. The two defaults differ on purpose. There, failing open keeps an
 * unknown shift visible; here, failing open would paint it live — asserting
 * something is happening now on the strength of a string we could not read.
 */
export function isShiftLiveNow(
	shiftDate: string | null | undefined,
	slot: string | null | undefined,
	now: Date,
): boolean {
	const start = shiftStartInstant(shiftDate, slot);
	const end = shiftEndInstant(shiftDate, slot);
	if (!start || !end) return false;
	const t = now.getTime();
	return start.getTime() <= t && t < end.getTime();
}

/**
 * Has this shift already finished?
 *
 * Fails OPEN: an unparseable slot returns `false`, so a shift we cannot reason
 * about is still offered rather than silently vanishing from the picker.
 */
export function hasShiftEnded(
	shiftDate: string | null | undefined,
	slot: string | null | undefined,
	now: Date,
): boolean {
	const end = shiftEndInstant(shiftDate, slot);
	if (!end) return false;
	return end.getTime() <= now.getTime();
}

/**
 * A shift that is OVER and that nobody worked — HIDDEN, everywhere (owner,
 * 24 Aug 2026: "it should just be hidden if no one was assigned", then "the
 * roster down here should also be hidden when the shift is hidden").
 *
 * ONE predicate, because two screens answering "is this hidden" differently is
 * how a request chip ends up pointing at a card that is not on the page. The
 * roster's demand band and its grid request markers both read this.
 *
 * The staffed test comes FIRST, and is what keeps this narrow: an ended shift
 * people DID work stays visible, greyed and labelled ENDED. Its unfilled seats
 * are a fact about the night the agency may have to answer for, and c800d5e
 * exists precisely because demand that silently disappears is demand the agency
 * loses track of. Only the shift nobody turned up to is pure noise.
 *
 * Inherits `hasShiftEnded`'s fail-OPEN: a shift whose slot carries no window is
 * never hidden, because nothing here can know whether it is over.
 */
export function isEndedAndUnworked(
	shift: {
		shiftDate: string | null | undefined;
		slot: string | null | undefined;
		staffedCount?: number | null;
	},
	now: Date,
): boolean {
	if ((shift.staffedCount ?? 0) > 0) return false;
	return hasShiftEnded(shift.shiftDate, shift.slot, now);
}
