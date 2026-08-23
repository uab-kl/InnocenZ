/**
 * ONE rule for the live badge every comcard wears (owner, 23 Aug 2026): "makes
 * all the comcard in the outlet and agency pages can see that the live pr
 * status is on duty, available, not available or scheduled for that time only".
 *
 * The states, strongest first:
 *   'on-duty'     — working RIGHT NOW: an own-agency assignment with a check-in
 *                   stamp and no check-out, or any committed window (own or
 *                   rival, bare times) containing the asked instant.
 *   'scheduled'   — booked some time that day, but not at the asked instant.
 *   'unavailable' — the PR blocked the day themselves.
 *   'available'   — none of the above; surfaces usually render NO badge.
 *
 * Privacy rides on the INPUTS, not on this function: rival commitments arrive
 * as bare "HH:MM - HH:MM" windows from the committed read, which never names an
 * agency or venue — see the cross-agency busy rule. This module only ever adds
 * arithmetic on top.
 */

export type PrLiveStatus = 'on-duty' | 'scheduled' | 'unavailable' | 'available';

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
	/** Minutes from midnight of the instant being asked about. */
	nowMinutes: number;
}): PrLiveStatus {
	if (opts.ownOnDuty) return 'on-duty';
	if (opts.committedToday.some((w) => windowContains(w, opts.nowMinutes))) {
		return 'on-duty';
	}
	if (opts.ownBookedToday || opts.committedToday.length > 0) return 'scheduled';
	if (opts.blockedToday) return 'unavailable';
	return 'available';
}
