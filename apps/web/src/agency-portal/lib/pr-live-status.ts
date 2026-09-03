/**
 * ONE rule for the live badge every comcard wears (owner, 23 Aug 2026): "makes
 * all the comcard in the outlet and agency pages can see that the live pr
 * status is on duty, available, not available or scheduled for that time only".
 *
 * The states, strongest first:
 *   'on-duty'     — a CHECK-IN STAMP and no check-out. Nothing else: the
 *                   owner's rule (23 Aug 2026), "if pr check in only on
 *                   duty, if not yet check in is schedule". A window
 *                   containing the current instant is still only a booking.
 *   'scheduled'   — booked that day (own row, or any bare committed window),
 *                   not yet checked in — cooldown/travel time included.
 *   'unavailable' — the PR blocked the day themselves.
 *   'available'   — none of the above; surfaces usually render NO badge.
 *
 * Privacy rides on the INPUTS, not on this function: rival commitments arrive
 * as bare "HH:MM - HH:MM" windows from the committed read, which never names an
 * agency or venue — see the cross-agency busy rule. This module only ever adds
 * arithmetic on top.
 */

export type PrLiveStatus =
	| "on-duty"
	| "scheduled"
	| "unavailable"
	| "available";

/**
 * "22:00 - 04:00" → [1320, 1680] — minutes from midnight, end pushed past 1440
 * when the window wraps. Null for anything unparseable (a label-only slot),
 * which callers must treat as "unknown", never as "free".
 */
export function windowMinutes(win: string): [number, number] | null {
	const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(win);
	if (!m) return null;
	const start = Number(m[1]) * 60 + Number(m[2]);
	let end = Number(m[3]) * 60 + Number(m[4]);
	if (Number.isNaN(start) || Number.isNaN(end)) return null;
	if (end <= start) end += 1440;
	return [start, end];
}

/**
 * Do two same-day windows share any minutes? Overnight wraps are compared by
 * also testing the other window shifted a day either way — "23:00 - 01:00"
 * genuinely collides with "00:30 - 02:00" of the same calendar date.
 */
export function windowsOverlap(a: string, b: string): boolean {
	const wa = windowMinutes(a);
	const wb = windowMinutes(b);
	if (!wa || !wb) return false;
	for (const shift of [-1440, 0, 1440]) {
		if (Math.max(wa[0], wb[0] + shift) < Math.min(wa[1], wb[1] + shift)) {
			return true;
		}
	}
	return false;
}

/**
 * The cooldown either side of a booking (owner, 23 Aug 2026: "if still in
 * cooldown time or travel time need show that the pr is scheduled"). The
 * client cannot run the real travel-gap physics — rival venues arrive as
 * bare windows with no pins — so this is the model's floor: 15 boarding
 * minutes plus a nominal half-hour of city travel. ADVISORY ONLY: the
 * server's location-aware guard still decides at assign time.
 */
export const TRAVEL_BUFFER_MINUTES = 45;

/** `windowsOverlap`, with the busy window padded by the travel cooldown. */
export function windowsOverlapPadded(
	busy: string,
	asked: string,
	padMinutes: number = TRAVEL_BUFFER_MINUTES,
): boolean {
	const wb = windowMinutes(busy);
	const wa = windowMinutes(asked);
	if (!wb || !wa) return false;
	const b0 = wb[0] - padMinutes;
	const b1 = wb[1] + padMinutes;
	for (const shift of [-1440, 0, 1440]) {
		if (Math.max(wa[0], b0 + shift) < Math.min(wa[1], b1 + shift)) {
			return true;
		}
	}
	return false;
}

/** `2026-08-25` → `2026-08-24`. UTC arithmetic, so no zone can shift the day. */
export function previousDayIso(dateIso: string): string {
	const d = new Date(`${dateIso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

/** `2026-08-25` → `2026-08-26`. UTC arithmetic, so no zone can shift the day. */
export function nextDayIso(dateIso: string): string {
	const d = new Date(`${dateIso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/** 240 → `"04:00"`. */
function hhmm(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The windows a PR is actually busy for ON `dateIso` — the ones stamped with
 * that date, PLUS the spill of any overnight window stamped the day BEFORE.
 *
 * A shift carries only its START date (`shift.shift_date`), so a 22:00 - 04:00
 * booking on the 24th is absent from the 25th's bucket while genuinely
 * occupying its first four hours. Every busy PREVIEW fetched and bucketed by
 * exact date and so could never see it, while the assign guard reads every
 * assignment with NO date window and refuses anyway — the preview warned LESS
 * than the guard it previews, which is how a venue books someone still on
 * another floor at 02:00 (proven live 24 Aug 2026 with
 * `_probe-overnight-busy-window-carry.ts`).
 *
 * The spill is REBASED into the target day's own frame — 22:00 - 04:00 on the
 * 24th becomes 00:00 - 04:00 on the 25th — rather than handed over raw. Raw
 * would appear to work, because `windowsOverlapPadded` already tries a ±1440
 * shift; but that same shift would also match YESTERDAY's ordinary
 * 10:00 - 12:00 against TODAY's 10:00 - 12:00 and invent a clash out of two
 * different days. Only a window that truly wraps may cross midnight, and only
 * as far as it actually reaches.
 */
export function windowsEffectiveOn(
	byDate: ReadonlyMap<string, string[]> | undefined,
	dateIso: string,
): string[] {
	if (!byDate) return [];
	const spill: string[] = [];
	for (const w of byDate.get(previousDayIso(dateIso)) ?? []) {
		const m = windowMinutes(w);
		// `windowMinutes` pushes the end past 1440 only when the window wraps,
		// so this is exactly "did last night reach today".
		if (!m || m[1] <= 1440) continue;
		spill.push(`00:00 - ${hhmm(m[1] - 1440)}`);
	}
	return [...spill, ...(byDate.get(dateIso) ?? [])];
}

/** Half-open overlap on one continuous minute line — a window ending exactly
 *  when the other starts is not a clash, same as the server's `shiftsOverlap`. */
export function minuteRangesOverlap(
	a: { from: number; to: number },
	b: { from: number; to: number },
): boolean {
	return a.from < b.to && b.from < a.to;
}

/**
 * A day's busy windows on the CONTINUOUS minute line an assign decision runs
 * on: today's effective windows as-is, plus TOMORROW's rebased +1440 — so an
 * overnight shift offered today (22:00 - 04:00 parses past 1440) can meet a
 * booking that starts the next morning (02:00 - 06:00 → 1560 - 1800). The
 * server's `shiftsOverlap` compares on exactly this timeline; the sheet's old
 * within-the-day copy is how that pair was cleared and the sheet under-warned.
 * Labels stay the bare display strings the windows arrived as — times, never
 * who or where.
 */
export function busyFrameOn(
	byDate: ReadonlyMap<string, string[]> | undefined,
	dateIso: string,
): { label: string; from: number; to: number }[] {
	const out: { label: string; from: number; to: number }[] = [];
	for (const w of windowsEffectiveOn(byDate, dateIso)) {
		const m = windowMinutes(w);
		if (m) out.push({ label: w, from: m[0], to: m[1] });
	}
	for (const w of byDate?.get(nextDayIso(dateIso)) ?? []) {
		const m = windowMinutes(w);
		if (m) out.push({ label: w, from: m[0] + 1440, to: m[1] + 1440 });
	}
	return out;
}

/**
 * Is this shift's own window already spoken for? Returns the colliding window's
 * bare label, or null.
 *
 * ⚠️ TIMES, NEVER WHO OR WHERE. The rows behind `byDate` come from the committed
 * read, which strips the agency and the venue at the server's privacy boundary
 * (owner, 3 Sep 2026: *"they should only see that the PR is Busy but they should
 * not be able to see that another agency assigned them to the shift"*). Every
 * caller may say "unavailable" and show the hours; none may say who booked them.
 *
 * A label-only slot ("Late night") carries no window and never collides — the
 * same fail-open the server's `shiftsOverlap` takes. Its "spoken for at an hour
 * nobody knows" is advice only, and deliberately NOT a refusal: greying every
 * card for it is the whole-day rule the owner retired on 20 Aug 2026.
 *
 * The assign sheet's `unavailableById` is this same test one step later in the
 * pipeline — it is handed the frame ready-made as a prop, so it cannot call
 * this. Both compare `windowMinutes` against `busyFrameOn` output through
 * `minuteRangesOverlap`; keep them that way, or the sheet and the grid will
 * start disagreeing about who is free.
 */
export function busyOverShift(
	byDate: ReadonlyMap<string, string[]> | undefined,
	shift: { shiftDate: string; slot?: string | null },
): string | null {
	const own = windowMinutes(shift.slot ?? "");
	if (!own) return null;
	const hit = busyFrameOn(byDate, shift.shiftDate).find((w) =>
		minuteRangesOverlap({ from: own[0], to: own[1] }, w),
	);
	return hit ? hit.label : null;
}

/** Is this instant (minutes from the day's midnight) inside the window? */
export function windowContains(win: string, minutes: number): boolean {
	const w = windowMinutes(win);
	if (!w) return false;
	return (
		(minutes >= w[0] && minutes < w[1]) ||
		(minutes + 1440 >= w[0] && minutes + 1440 < w[1])
	);
}

export function derivePrLiveStatus(opts: {
	/** The PR blocked this day themselves. */
	blockedToday: boolean;
	/** Own-agency assignment today: checked in and not yet out. */
	ownOnDuty: boolean;
	/** Own-agency assignment today exists at all (any state that still staffs). */
	ownBookedToday: boolean;
	/** Bare committed windows for the day — own AND rival, times only. */
	committedToday: string[];
	/**
	 * A commitment that day whose slot named no clock time — spoken for at an
	 * UNKNOWN hour. Scheduled, because booked-that-day is what the state means;
	 * never unavailable, because nothing knows WHEN (the 20 Aug narrowing).
	 */
	committedTimeUnknownToday?: boolean;
	/** Minutes from midnight of the instant being asked about. */
	nowMinutes: number;
}): PrLiveStatus {
	// Check-in alone earns ON DUTY. A rival window carries no stamps, so it
	// can never claim more than scheduled — and an own booking without a
	// check-in is exactly the state the check-in exists to distinguish.
	if (opts.ownOnDuty) return "on-duty";
	if (
		opts.ownBookedToday ||
		opts.committedToday.length > 0 ||
		opts.committedTimeUnknownToday
	)
		return "scheduled";
	if (opts.blockedToday) return "unavailable";
	return "available";
}
