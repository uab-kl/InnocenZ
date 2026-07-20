import type {
	AgencyRosterSlot,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import { formatOutletDayLabel } from "@agency-portal/lib/agency-outlet-shifts";
import { parseShiftWindow } from "@agency-portal/lib/portal-sync";
import type { ShiftRequest } from "@agency-portal/lib/store";
import type { Shift } from "@/services/shift";
import type {
	ShiftAssignment,
	ShiftAssignmentStatus,
} from "@/services/shift-assignment";

// Backend shift/assignment rows -> the demo shapes the portal UI renders. Both
// portals read the same two endpoints, so the mapping lives here once: the
// agency roster grid builds AgencyRosterSlots, the outlet Today screen builds
// ShiftRequests, and both need the same window/status/payout parsing.

// A shift-assignment status doesn't fully overlap the demo's live roster
// statuses; map to the closest planning-view state.
export function rosterStatusFromAssignment(
	status: ShiftAssignmentStatus,
): RosterSlotStatus {
	switch (status) {
		case "assigned":
			// PRs don't accept/decline — they can only cancel per the cancellation
			// rules — so an assigned shift is effectively scheduled, not "awaiting
			// PR". See the pr-cannot-accept-decline domain rule.
			return "scheduled";
		case "confirmed":
		case "completed":
			return "scheduled";
		case "no_show":
		case "cancelled":
			return "unavailable";
		default:
			return "scheduled";
	}
}

// The backend shift `slot` is free text; only treat it as a time window when it
// actually looks like one, so label-only slots don't get fake times.
const TIME_WINDOW_RE = /\d{1,2}:\d{2}/;
// "8pm", "8 pm", "8:30pm", "20:00" — the forms an operator actually types.
const CLOCK_TOKEN_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

/** One end of a slot -> 24h "HH:MM", or null when it isn't a clock time. */
function toHhmm(token: string): string | null {
	const m = token.trim().match(CLOCK_TOKEN_RE);
	if (!m) return null;
	let hour = Number(m[1]);
	const minutes = m[2] ?? "00";
	const meridiem = m[3]?.toLowerCase();
	if (meridiem) {
		if (hour < 1 || hour > 12) return null;
		hour = hour % 12;
		if (meridiem === "pm") hour += 12;
	} else if (hour > 23) {
		return null;
	}
	if (Number(minutes) > 59) return null;
	return `${String(hour).padStart(2, "0")}:${minutes}`;
}

/**
 * The demo's time helpers expect "HH:MM - HH:MM"; the backend stores whatever
 * the outlet typed ("8pm - 2am"). Normalize at this boundary so the calendar
 * renders a real range instead of falling back to 12p–12p, and so the roster
 * window / estimated payout can be derived. Returns null for label-only slots
 * ("Late night"), which keep their text and get no fake times.
 */
export function normalizedSlotWindow(
	slot: string | null,
): { start: string; end: string } | null {
	if (!slot) return null;
	const parts = slot.split(/[—–-]/);
	if (parts.length !== 2) return null;
	const start = toHhmm(parts[0]);
	const end = toHhmm(parts[1]);
	return start && end ? { start, end } : null;
}

/** The slot as the demo shapes expect it — normalized when parseable. */
export function normalizedSlotLabel(slot: string | null): string {
	const window = normalizedSlotWindow(slot);
	return window ? `${window.start} - ${window.end}` : (slot ?? "");
}

export function shiftWindow(slot: string | null): {
	start: string;
	end: string;
} {
	const normalized = normalizedSlotWindow(slot);
	if (normalized) return normalized;
	if (slot && TIME_WINDOW_RE.test(slot)) {
		const { shiftStart, shiftEnd } = parseShiftWindow(slot);
		return { start: shiftStart, end: shiftEnd };
	}
	return { start: "", end: "" };
}

function minutesOf(hhmm: string): number | null {
	const [h, m] = hhmm.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return h * 60 + m;
}

// Estimated payout so the payout filter has something to compare: window hours
// (wrapping past midnight) times the shift's hourly rate. Undefined when the
// window or rate can't be parsed.
export function estPayoutFor(
	window: { start: string; end: string },
	payPerHour: string,
): number | undefined {
	const start = minutesOf(window.start);
	const end = minutesOf(window.end);
	const pay = Number(payPerHour);
	if (start == null || end == null || !Number.isFinite(pay)) return undefined;
	let mins = end - start;
	if (mins <= 0) mins += 24 * 60;
	return (mins / 60) * pay;
}

// numeric(12,2) columns arrive as strings; coerce defensively.
function num(value: string | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * One assignment = one roster slot. `prNameById` is for callers that fetched the
 * PR directory (agency); outlet callers cannot read `/pr` and instead rely on
 * the `prName` the assignment list joins in. Demo-only fields (swaps, floor
 * metrics, pay tiers) are left unset until their backend features land.
 */
export function rosterSlotsFromBackend(input: {
	shifts: Shift[];
	assignments: ShiftAssignment[];
	prNameById?: Map<string, string>;
	outletNameById?: Map<string, string>;
}): AgencyRosterSlot[] {
	const { shifts, assignments, prNameById, outletNameById } = input;
	const shiftById = new Map(shifts.map((s) => [s.id, s]));

	const slots: AgencyRosterSlot[] = [];
	for (const a of assignments) {
		// Assignment's shift is outside the requested window — skip.
		const shift = shiftById.get(a.shiftId);
		if (!shift) continue;
		const window = shiftWindow(shift.slot);
		slots.push({
			id: a.id,
			prId: a.prId,
			prName: prNameById?.get(a.prId) ?? a.prName ?? "Unknown PR",
			outlet: outletNameById?.get(shift.outletId) ?? shift.outletId,
			date: shift.shiftDate,
			dateIso: shift.shiftDate,
			// Must match the ShiftRequest's `shift` exactly — the panels join roster
			// slots to a shift on this string.
			shift: normalizedSlotLabel(shift.slot) || (shift.eventName ?? ""),
			shiftStart: window.start,
			shiftEnd: window.end,
			estPayout: estPayoutFor(window, shift.payPerHour),
			status: rosterStatusFromAssignment(a.status),
			checkedInAt: a.checkInAt ?? undefined,
			checkedOutAt: a.checkOutAt ?? undefined,
			noShowFlag: a.status === "no_show" ? true : undefined,
			cancelledAt: a.status === "cancelled" ? a.updatedAt : undefined,
			agencyId: a.agencyId,
		});
	}
	return slots;
}

/**
 * A backend shift -> the demo `ShiftRequest` the outlet Today cards render.
 * `prs` carries the real assignment PR ids so the detail panels can match them
 * against the roster slots built by `rosterSlotsFromBackend`.
 *
 * `date` is the demo's human label ('Tonight' / 'Tomorrow' / '21 Jul') while
 * `dateIso` carries the real date — the resolver prefers `dateIso`, so the label
 * is display only. Fields with no backend behind them (drink menus, tier rates,
 * per-shift floor counts, dress code, cut-loss state) are left unset so the
 * screens fall back to the outlet's Workspace settings and demo defaults.
 */
export function shiftRequestFromBackendShift(input: {
	shift: Shift;
	assignments: ShiftAssignment[];
	outletName: string;
	todayIso: string;
}): ShiftRequest {
	const { shift, assignments, outletName, todayIso } = input;
	const forShift = assignments.filter((a) => a.shiftId === shift.id);
	// Cancelled / no-show PRs are not staffing the floor tonight.
	const staffing = forShift.filter(
		(a) => a.status !== "cancelled" && a.status !== "no_show",
	);
	const label = formatOutletDayLabel(shift.shiftDate, todayIso);

	return {
		id: shift.id,
		outletName,
		// The demo calls today's night "Tonight"; formatOutletDayLabel says "Today".
		date: label === "Today" ? "Tonight" : label,
		dateIso: shift.shiftDate,
		// Same expression as the roster slot's `shift` — they are joined on it.
		shift: normalizedSlotLabel(shift.slot) || (shift.eventName ?? ""),
		quantity: shift.quantity,
		// Trust the real roster over the shift's own counter when PRs are assigned.
		filled: staffing.length > 0 ? staffing.length : shift.filled,
		languages: shift.languages ?? "",
		event: shift.eventName ?? "Shift",
		eventKind: shift.eventKind,
		preferredRating: shift.preferredRating ?? 0,
		estimatedCost: num(shift.estimatedCost),
		liveSales: num(shift.liveSales),
		status: shift.status,
		prs: staffing.map((a) => a.prId),
		payPerHour: num(shift.payPerHour),
	};
}
