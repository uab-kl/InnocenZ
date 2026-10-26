import { shiftEndInstant } from "@agency-portal/lib/shift-window";
import type { ShiftRequest } from "@agency-portal/lib/store";

/**
 * Is this shift past taking anyone on?
 *
 * The staffing section said "No PRs booked yet — open for applications" on
 * every empty shift, including ones that had already ENDED — a night in the
 * past is not open to anybody, and saying so invites a wait that cannot pay off.
 *
 * Overnight-aware: a 22:00–04:00 is still on until 04:00 the next morning, so
 * the END instant decides, never the date alone. Only a slot with no readable
 * window falls back to the calendar day. A sealed night is closed outright.
 */
export function shiftHasClosed(input: {
	dateIso: string;
	slot: string | null | undefined;
	status: ShiftRequest["status"];
	now: Date;
	todayIso: string;
}): boolean {
	if (input.status === "sealed") return true;
	const end = shiftEndInstant(input.dateIso, input.slot);
	if (end) return end.getTime() <= input.now.getTime();
	return input.dateIso < input.todayIso;
}
