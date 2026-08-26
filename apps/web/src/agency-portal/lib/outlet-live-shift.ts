import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { resolveOutletShiftDateIso } from "@agency-portal/lib/agency-outlet-shifts";
import {
	hasShiftEnded,
	shiftStartInstant,
} from "@agency-portal/lib/shift-window";
import type { ShiftRequest } from "@agency-portal/lib/store";

/**
 * WHICH of a venue's shifts today is "the live one" — the card the outlet's
 * home page leads with, badges Live, and hangs its labour-cost and cut-loss
 * panels off.
 *
 * Lives in a lib rather than inside the component because it has now been wrong
 * three times, each time in a way nothing could catch: it matched the human
 * label ("Tonight") and promoted next week's shift; it fell back to `todays[0]`
 * and badged a finished shift Live at half past seven in the evening; and it
 * took the first shift that was not OVER, which on a two-shift day meant the
 * first ALPHABETICALLY — `outletHomeShiftRequests` sorts by event name once the
 * date ties. At 13:50, with TESTING123 running 11:00–14:00 and Friday Lounge
 * not starting until 14:10, "F" beat "T" and the venue was shown a shift that
 * had not begun while the one on its floor sat in the list below. Nothing in
 * that test asked whether a shift had STARTED.
 *
 * Two ranks and a clock, which is the whole rule:
 *
 *   0. ENDED, but somebody is still on it — the owner's rule (23 Aug 2026,
 *      *"the pr not yet end why show another shift"*). It outranks even a
 *      RUNNING shift on purpose: an unresolved booking is the thing that needs
 *      the venue, and that case is what made them ask.
 *   1. STILL TO RESOLVE ITSELF — running, or not started yet. Sorted by START
 *      TIME, and that single sort is what puts a running shift above an
 *      upcoming one: a shift that has started began in the PAST and one that
 *      has not begins in the future, so no separate "running" rank is needed.
 *      A third rank was written here first; a deliberately broken build proved
 *      it changed no outcome, which is the only reason this comment can claim
 *      the sort does the work.
 *   ✗. ENDED with nobody left on it — DROPPED, not merely sorted last.
 *
 * A shift with no parseable window sorts last inside rank 1 (its start is
 * +Infinity) and is kept: no times means no end to be past, and blanking a
 * venue's home page over a label-only slot is worse than leaving its card up.
 */
const RANK_ENDED_BUT_UNRESOLVED = 0;
const RANK_UNRESOLVED = 1;

export function pickLiveShift(input: {
	shifts: ShiftRequest[];
	roster: AgencyRosterSlot[];
	todayIso: string;
	now: Date;
}): ShiftRequest | null {
	const { shifts, roster, todayIso, now } = input;

	const todays = shifts.filter(
		(s) =>
			s.status === "confirmed" &&
			resolveOutletShiftDateIso(s.date, s.dateIso, todayIso) === todayIso,
	);

	/**
	 * A CLOCK-ENDED SHIFT WITH AN OPEN BOOKING IS NOT OVER.
	 *
	 * The clock ends the WINDOW; only the people resolve the SHIFT. The STAMP is
	 * the fact — the status vocabulary has no "checked-out" value (it folds back
	 * into scheduled), while cancelled, no-show and approved-leave all map to
	 * "unavailable", which is an absence and must not hold the card.
	 */
	const hasOpenBooking = (shift: ShiftRequest, dateIso: string) =>
		roster.some(
			(slot) =>
				slot.dateIso === dateIso &&
				slot.shift === shift.shift &&
				!slot.checkedOutAt &&
				slot.status !== "unavailable",
		);

	const ranked = todays
		.map((shift) => {
			const dateIso = resolveOutletShiftDateIso(
				shift.date,
				shift.dateIso,
				todayIso,
			);
			const start = shiftStartInstant(dateIso, shift.shift);
			const startedAt = start ? start.getTime() : Number.POSITIVE_INFINITY;
			if (hasShiftEnded(dateIso, shift.shift, now)) {
				return {
					shift,
					startedAt,
					rank: hasOpenBooking(shift, dateIso)
						? RANK_ENDED_BUT_UNRESOLVED
						: Number.POSITIVE_INFINITY,
				};
			}
			return { shift, startedAt, rank: RANK_UNRESOLVED };
		})
		.filter((r) => Number.isFinite(r.rank))
		.sort((a, b) => a.rank - b.rank || a.startedAt - b.startedAt);

	return ranked[0]?.shift ?? null;
}
