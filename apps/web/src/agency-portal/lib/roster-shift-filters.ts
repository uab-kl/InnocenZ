import type {
	AgencyManagedPR,
	AgencyRosterSlot,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import type { AgencyOutletAvailableShift } from "@agency-portal/lib/agency-outlet-shifts";
import { parseShiftWindow } from "@agency-portal/lib/portal-sync";

export type RosterShiftFilterState = {
	nameQuery: string;
	outlet: string;
	status: "" | RosterSlotStatus | "late" | "no-show";
	payoutMin: string;
	payoutMax: string;
	startTime: string;
	endTime: string;
};

/** Extra filters for the weekly planning timetable */
export type RosterTimetableFilterState = RosterShiftFilterState & {
	showPrs: "" | "scheduled" | "free";
};

export const EMPTY_ROSTER_SHIFT_FILTERS: RosterShiftFilterState = {
	nameQuery: "",
	outlet: "",
	status: "",
	payoutMin: "",
	payoutMax: "",
	startTime: "",
	endTime: "",
};

export const EMPTY_ROSTER_TIMETABLE_FILTERS: RosterTimetableFilterState = {
	...EMPTY_ROSTER_SHIFT_FILTERS,
	showPrs: "",
};

function hhmmToMinutes(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const [h, m] = trimmed.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return h * 60 + m;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Does this shift end at or before the "End by" time the user asked for?
 *
 * Both values are carried onto the SHIFT'S OWN timeline before comparing, which
 * is the only way the answer is meaningful here: the default shift in this
 * product is 22:00-04:00, so almost every row crosses midnight.
 *
 * Read on a bare same-day scale, a 22:00-04:00 shift "ends" at 240 and passed
 * "End by 23:00" (1380) — the filter said yes to a shift still on the floor five
 * hours after the cutoff. Wrapping only the shift end fixes that case and breaks
 * the opposite one, excluding the shift from "End by 04:00" which is an exact
 * match. So the CUTOFF wraps too, whenever it falls before the shift starts —
 * "by 04:00" on a shift that begins at 22:00 can only mean the following
 * morning.
 */
function endsBy(slotStart: number, slotEndRaw: number, endBy: number): boolean {
	const slotEnd =
		slotEndRaw > slotStart ? slotEndRaw : slotEndRaw + MINUTES_PER_DAY;
	const cutoff = endBy >= slotStart ? endBy : endBy + MINUTES_PER_DAY;
	return slotEnd <= cutoff;
}

export function rosterShiftFiltersActive(f: RosterShiftFilterState): boolean {
	return Boolean(
		f.nameQuery ||
			f.outlet ||
			f.status ||
			f.payoutMin ||
			f.payoutMax ||
			f.startTime ||
			f.endTime,
	);
}

/**
 * How many filters are narrowing the list right now.
 *
 * The bar used to say only "some filter is on" (a boolean), which is the one
 * thing the user can already see. The COUNT is what tells them how much is
 * hidden — and it is what makes "Clear" a decision rather than a guess.
 * Start/end and min/max each count as one, because each pair is one range
 * control on screen.
 */
export function countActiveRosterShiftFilters(
	f: RosterShiftFilterState,
): number {
	let n = 0;
	if (f.nameQuery.trim()) n++;
	if (f.outlet) n++;
	if (f.status) n++;
	if (f.payoutMin || f.payoutMax) n++;
	if (f.startTime || f.endTime) n++;
	return n;
}

export function countActiveRosterTimetableFilters(
	f: RosterTimetableFilterState,
): number {
	return countActiveRosterShiftFilters(f) + (f.showPrs ? 1 : 0);
}

export function rosterTimetableFiltersActive(
	f: RosterTimetableFilterState,
): boolean {
	return rosterShiftFiltersActive(f) || Boolean(f.showPrs);
}

/** Filters that narrow outlet shifts in the assign modal (not PR name / roster status). */
export function planningOutletShiftFiltersActive(
	f: RosterShiftFilterState,
): boolean {
	return Boolean(
		f.outlet || f.payoutMin || f.payoutMax || f.startTime || f.endTime,
	);
}

export function filterPlanningOutletShifts(
	shifts: AgencyOutletAvailableShift[],
	f: RosterShiftFilterState,
): AgencyOutletAvailableShift[] {
	const min = f.payoutMin ? parseFloat(f.payoutMin) : null;
	const max = f.payoutMax ? parseFloat(f.payoutMax) : null;
	const startFrom = hhmmToMinutes(f.startTime);
	const endBy = hhmmToMinutes(f.endTime);

	return shifts.filter((shift) => {
		if (f.outlet && shift.outlet !== f.outlet) return false;
		if (min != null && !Number.isNaN(min) && shift.payEstimate < min)
			return false;
		if (max != null && !Number.isNaN(max) && shift.payEstimate > max)
			return false;
		const { shiftStart, shiftEnd } = parseShiftWindow(shift.shift);
		if (startFrom != null) {
			const slotStart = hhmmToMinutes(shiftStart);
			if (slotStart == null || slotStart < startFrom) return false;
		}
		if (endBy != null) {
			const slotStart = hhmmToMinutes(shiftStart);
			const slotEnd = hhmmToMinutes(shiftEnd);
			if (slotStart == null || slotEnd == null) return false;
			if (!endsBy(slotStart, slotEnd, endBy)) return false;
		}
		return true;
	});
}

/**
 * How a slot's NAME and PAYOUT are read when filtering.
 *
 * Both default to the raw slot fields, which is what every caller used to get
 * implicitly — and both defaults are wrong against what the table renders:
 *
 * - `prName` is the PR's NICKNAME, while the roster prints
 *   "(Nickname) Legal Name" via `formatPayeeLabel`. Typing the legal half of a
 *   name that is visibly on screen returned nothing.
 * - `estPayout` is hours x payPerHour, while the Est. payout column shows
 *   `rosterSlotDisplayPayout`, a commission-aware figure. Filtering "min 300"
 *   compared against a number the screen never displays.
 *
 * The resolvers live here rather than being computed inside because the real
 * ones need PR records, commission rules and receipt scans — data the route
 * holds and this leaf module must not reach for.
 */
export interface RosterFilterResolvers {
	/** The label as rendered, e.g. "(Vicky) Victoria Tan". */
	labelOf?: (slot: AgencyRosterSlot) => string;
	/** The payout as rendered in the Est. payout column. */
	payoutOf?: (slot: AgencyRosterSlot) => number;
}

export function filterRosterShifts(
	slots: AgencyRosterSlot[],
	f: RosterShiftFilterState,
	resolvers: RosterFilterResolvers = {},
): AgencyRosterSlot[] {
	const q = f.nameQuery.trim().toLowerCase();
	const min = f.payoutMin ? parseFloat(f.payoutMin) : null;
	const max = f.payoutMax ? parseFloat(f.payoutMax) : null;
	const startFrom = hhmmToMinutes(f.startTime);
	const endBy = hhmmToMinutes(f.endTime);

	return slots.filter((s) => {
		// Match the rendered label AND the raw nickname: the label is what the
		// user can see, the nickname is what they may know the person by.
		if (q) {
			const label = resolvers.labelOf?.(s) ?? "";
			const haystack = `${label} ${s.prName}`.toLowerCase();
			if (!haystack.includes(q)) return false;
		}
		if (f.outlet && s.outlet !== f.outlet) return false;
		if (f.status === "late" && !s.lateFlag) return false;
		if (f.status === "no-show" && !s.noShowFlag) return false;
		if (f.status && f.status !== "late" && f.status !== "no-show") {
			const matches =
				f.status === "scheduled"
					? s.status === "scheduled" || s.status === "en-route"
					: s.status === f.status;
			if (!matches) return false;
		}
		const payout = resolvers.payoutOf?.(s) ?? s.estPayout ?? 0;
		if (min != null && !Number.isNaN(min) && payout < min) return false;
		if (max != null && !Number.isNaN(max) && payout > max) return false;
		if (startFrom != null) {
			const slotStart = hhmmToMinutes(s.shiftStart);
			if (slotStart == null || slotStart < startFrom) return false;
		}
		if (endBy != null) {
			const slotStart = hhmmToMinutes(s.shiftStart);
			const slotEnd = hhmmToMinutes(s.shiftEnd);
			if (slotStart == null || slotEnd == null) return false;
			if (!endsBy(slotStart, slotEnd, endBy)) return false;
		}
		return true;
	});
}

export function timetableSlotMatches(
	slot: AgencyRosterSlot,
	f: RosterShiftFilterState,
): boolean {
	return filterRosterShifts([slot], f).length > 0;
}

export function filterTimetablePrs(
	agencyPRs: AgencyManagedPR[],
	roster: AgencyRosterSlot[],
	weekDays: string[],
	f: RosterTimetableFilterState,
	getScheduleState: (
		prId: string,
		dateIso: string,
	) => "free" | "booked" | "unavailable",
): AgencyManagedPR[] {
	const q = f.nameQuery.trim().toLowerCase();

	return agencyPRs.filter((pr) => {
		if (pr.suspended || pr.detached) return false;
		if (q && !pr.name.toLowerCase().includes(q)) return false;

		const weekSlots = roster.filter(
			(s) => s.prId === pr.id && weekDays.includes(s.dateIso),
		);
		const matchingSlots = filterRosterShifts(weekSlots, f);
		const hasFreeDay = weekDays.some(
			(d) => getScheduleState(pr.id, d) === "free",
		);

		if (f.showPrs === "scheduled") return matchingSlots.length > 0;
		if (f.showPrs === "free") return hasFreeDay;

		if (rosterShiftFiltersActive(f)) {
			return matchingSlots.length > 0 || hasFreeDay;
		}
		return true;
	});
}

export function countTimetableMatchingSlots(
	roster: AgencyRosterSlot[],
	weekDays: string[],
	prIds: Set<string>,
	f: RosterTimetableFilterState,
): number {
	return filterRosterShifts(
		roster.filter((s) => weekDays.includes(s.dateIso) && prIds.has(s.prId)),
		f,
	).length;
}
