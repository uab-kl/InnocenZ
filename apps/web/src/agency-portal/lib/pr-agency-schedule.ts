import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { rosterSlotAgencyName } from "@agency-portal/lib/agency-demo";
import {
	addDaysToIso,
	getLiveTodayIso,
	getPayrollWeekSundayIso,
} from "@agency-portal/lib/demo-clock";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import {
	DEFAULT_PR_AGENCY_NAME,
	fmtHistDate,
} from "@agency-portal/lib/pr-demo";
import type { PrUpcomingShift } from "@agency-portal/lib/pr-features";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** Atlas payroll cycle window — agency publishes shifts here (live Sun through +3 weeks). */
export function getAgencyScheduleFromIso(): string {
	return getPayrollWeekSundayIso();
}

export function getAgencyScheduleToIso(fromIso = getLiveTodayIso()): string {
	return addDaysToIso(fromIso, 21);
}

export type PrUpcomingEventKind =
	| "confirmed"
	| "pending"
	| "swap"
	| "assignment";

export type PrUpcomingEvent = {
	id: string;
	outlet: string;
	date: [number, number, number];
	time: string;
	kind: PrUpcomingEventKind;
	detail: string;
};

function ymdFromIso(iso: string): [number, number, number] {
	const [y, m, d] = iso.split("-").map(Number);
	return [y, m, d];
}

/**
 * Future shifts — roster assignments, swaps, bookings + outlet-confirmed upcoming list.
 *
 * `kind` is the machine-readable state and is what callers branch on; `detail`
 * is the sentence the PR reads. Only `detail` moves with the locale — a status
 * is data and the words are presentation, and only one of the two may ever be
 * compared.
 */
export function buildPrUpcomingEvents(
	prId: string,
	roster: AgencyRosterSlot[],
	upcoming: PrUpcomingShift[],
	baselineIso = getLiveTodayIso(),
	t: PortalTranslations,
): PrUpcomingEvent[] {
	const events: PrUpcomingEvent[] = [];
	const covered = new Set<string>();

	for (const slot of roster) {
		if (
			slot.prId !== prId ||
			slot.dateIso < baselineIso ||
			slot.status === "unavailable"
		)
			continue;

		const dateYmd = ymdFromIso(slot.dateIso);
		const key = `${slot.dateIso}|${slot.outlet}`;

		if (slot.status === "assignment-pending" && slot.agencyAssignment) {
			events.push({
				id: slot.id,
				outlet: slot.outlet,
				date: dateYmd,
				time: slot.shift,
				kind: "assignment",
				// `agencyNote` is the agency's own free text — data, so it is shown
				// verbatim; only the fallback sentence is copy.
				// ⚠️ The fallback said "approve or decline in schedule". A PR can do
				// neither — they can only CANCEL (see the pr-cannot-accept-decline
				// rule, and rosterGrid.leaveAwaitingAgency, which was corrected for
				// naming the same wrong party). Translating that verbatim would have
				// shipped the wrong instruction in a second language.
				detail:
					slot.agencyAssignment.agencyNote ?? t.libShift.eventAgencyAssignment,
			});
			covered.add(key);
			continue;
		}

		if (slot.outletSwap?.status === "pending_pr") {
			events.push({
				id: `${slot.id}-swap`,
				outlet: slot.outlet,
				date: dateYmd,
				time: slot.shift,
				kind: "swap",
				detail: fill(t.libShift.swapMoveToOutlet, {
					outlet: slot.outletSwap.targetOutlet,
					note: slot.outletSwap.agencyNote ?? t.libShift.swapRequestFromAgency,
				}),
			});
			covered.add(key);
			continue;
		}

		if (slot.status === "outlet-pending") {
			events.push({
				id: slot.id,
				outlet: slot.outlet,
				date: dateYmd,
				time: slot.shift,
				kind: "pending",
				detail: fill(t.libShift.outletMustConfirmSlot, {
					outlet: slot.outlet,
				}),
			});
			covered.add(key);
			continue;
		}

		if (
			slot.status === "scheduled" ||
			slot.status === "swap-pending" ||
			slot.status === "en-route"
		) {
			if (!covered.has(key)) {
				events.push({
					id: slot.id,
					outlet: slot.outlet,
					date: dateYmd,
					time: slot.shift,
					kind: slot.status === "swap-pending" ? "pending" : "confirmed",
					detail:
						slot.status === "swap-pending"
							? t.libShift.swapAwaitingOutlet
							: t.libShift.scheduledOnAgencyRoster,
				});
				covered.add(key);
			}
		}
	}

	for (const up of upcoming) {
		const iso = dateKeyFromTuple(up.date);
		if (iso < baselineIso) continue;
		const rosterCovered = roster.some(
			(s) =>
				s.prId === prId &&
				s.dateIso === iso &&
				outletMatches(s.outlet, up.outlet),
		);
		if (rosterCovered) continue;
		events.push({
			id: up.id,
			outlet: up.outlet,
			date: up.date,
			time: up.time,
			kind: up.status === "confirmed" ? "confirmed" : "pending",
			// The "not confirmed" arm named the DEMO agency ("Atlas proposed"), so a
			// real PR was told a company they have never worked for booked them.
			// It now names the role, the way prPortal.assignedByAgencyNote does.
			detail:
				up.status === "confirmed"
					? fill(t.libShift.outletConfirmedOnBookings, { outlet: up.outlet })
					: t.libShift.agencyProposedNotConfirmed,
		});
	}

	return events.sort((a, b) => {
		const ak = dateKeyFromTuple(a.date);
		const bk = dateKeyFromTuple(b.date);
		return ak.localeCompare(bk) || a.outlet.localeCompare(b.outlet);
	});
}

export type ShiftDataSource = "agency" | "outlet";

export type TimetableEntry = {
	id: string;
	dateIso: string;
	dateLabel: string;
	outlet: string;
	time: string;
	/**
	 * The rendered word only. `statusVariant` is the machine-readable half and is
	 * the one to branch on — comparing `statusLabel` to anything would work in
	 * English and quietly stop matching in Chinese, which is how the outlet
	 * staffing tags lost their colours (see OutletShiftStaffingSection).
	 *
	 * The catch-all arm is the one exception: a status this builder does not
	 * recognise falls through to the raw stored value rather than blanking a pill.
	 */
	statusLabel: string;
	statusVariant: "green" | "amber" | "red" | "ink";
	source: ShiftDataSource;
	/** An outlet or agency NAME — data, never translated. */
	sourceLabel: string;
	sourceDetail: string;
	slot?: AgencyRosterSlot;
	upcoming?: PrUpcomingShift;
};
export type PrScheduleDayKind =
	| "past"
	| "open"
	| "unavailable"
	| "assigned"
	| "pending"
	| "active";

export interface PrScheduleDay {
	dateIso: string;
	label: string;
	kind: PrScheduleDayKind;
	slots: AgencyRosterSlot[];
	upcoming?: PrUpcomingShift;
}

function dateKeyFromTuple(d: [number, number, number]) {
	const [y, m, day] = d;
	return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function eachDateIsoInRange(fromIso: string, toIso: string): string[] {
	const [fy, fm, fd] = fromIso.split("-").map(Number);
	const [ty, tm, td] = toIso.split("-").map(Number);
	const out: string[] = [];
	const cursor = new Date(fy, fm - 1, fd);
	const end = new Date(ty, tm - 1, td);
	while (cursor <= end) {
		out.push(
			`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
		);
		cursor.setDate(cursor.getDate() + 1);
	}
	return out;
}

const ACTIVE_STATUSES = new Set<AgencyRosterSlot["status"]>([
	"on-duty",
	"en-route",
]);

function classifyDay(
	dateIso: string,
	slots: AgencyRosterSlot[],
	upcoming: PrUpcomingShift | undefined,
	baselineIso: string,
): PrScheduleDayKind {
	if (dateIso < baselineIso) return "past";
	if (slots.some((s) => s.status === "unavailable")) return "unavailable";
	if (slots.some((s) => ACTIVE_STATUSES.has(s.status))) return "active";
	if (
		slots.some(
			(s) => s.status === "assignment-pending" || s.status === "outlet-pending",
		)
	)
		return "pending";
	if (
		slots.some((s) => s.status === "scheduled" || s.status === "swap-pending")
	)
		return "assigned";
	if (upcoming) return upcoming.status === "pending" ? "pending" : "assigned";
	return "open";
}

export function buildPrScheduleDays(
	prId: string,
	roster: AgencyRosterSlot[],
	upcoming: PrUpcomingShift[],
	baselineIso = DEFAULT_ROSTER_DATE_ISO,
): PrScheduleDay[] {
	const upcomingByDate = new Map(
		upcoming.map((u) => [dateKeyFromTuple(u.date), u] as const),
	);

	return eachDateIsoInRange(
		getAgencyScheduleFromIso(),
		getAgencyScheduleToIso(),
	).map((dateIso) => {
		const [y, m, d] = dateIso.split("-").map(Number);
		const slots = roster.filter(
			(s) => s.prId === prId && s.dateIso === dateIso,
		);
		const up = upcomingByDate.get(dateIso);
		return {
			dateIso,
			label: fmtHistDate(y, m, d),
			kind: classifyDay(dateIso, slots, up, baselineIso),
			slots,
			upcoming: up,
		};
	});
}

export function dayCanMarkUnavailable(day: PrScheduleDay): boolean {
	if (day.kind === "past" || day.kind === "active") return false;
	if (day.kind === "unavailable" || day.kind === "open") return true;
	return false;
}

/** Tap-to-toggle only on open or unavailable days (not booked/pending shifts). */
export function dayCanToggleAvailability(day: PrScheduleDay): boolean {
	return dayCanMarkUnavailable(day);
}

function slotHasRosterCoverage(
	slot: AgencyRosterSlot,
	upcoming: PrUpcomingShift,
): boolean {
	const key = dateKeyFromTuple(upcoming.date);
	return slot.dateIso === key && outletMatches(slot.outlet, upcoming.outlet);
}

function timetableEntryKey(entry: TimetableEntry): string {
	return `${entry.dateIso}|${entry.outlet}|${entry.time}`;
}

function dedupeTimetableEntries(entries: TimetableEntry[]): TimetableEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = timetableEntryKey(entry);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function resolveSlotEntry(
	slot: AgencyRosterSlot,
	t: PortalTranslations,
): TimetableEntry {
	const [y, m, d] = slot.dateIso.split("-").map(Number);
	// The third copy of `rosterSlotAgencyName`'s chain, and like the other two it
	// omitted the `agencyId` arm — so a real backend slot, which carries only an
	// id, fell to the demo literal and labelled the PR's own shift "Atlas Agency"
	// no matter who actually booked them.
	const agency = rosterSlotAgencyName(slot);

	if (slot.status === "assignment-pending") {
		const outletRequested = slot.agencyAssignment?.requestedByOutlet;
		return {
			id: slot.id,
			dateIso: slot.dateIso,
			dateLabel: fmtHistDate(y, m, d),
			outlet: slot.outlet,
			time: slot.shift,
			statusLabel: t.roster.scheduled,
			statusVariant: "green",
			source: outletRequested ? "outlet" : "agency",
			sourceLabel: outletRequested ? slot.outlet : agency,
			// Both fallbacks named the DEMO agency. On a real session the PR was
			// told "Atlas confirmed" about a company that never touched the slot.
			sourceDetail:
				slot.agencyAssignment?.agencyNote ??
				(outletRequested
					? fill(t.libShift.outletRequestedAgencyConfirmed, {
							outlet: slot.outlet,
						})
					: t.libShift.agencyAssignedCancelPolicy),
			slot,
		};
	}

	if (slot.status === "outlet-pending") {
		return {
			id: slot.id,
			dateIso: slot.dateIso,
			dateLabel: fmtHistDate(y, m, d),
			outlet: slot.outlet,
			time: slot.shift,
			statusLabel: t.libShift.awaitingAgency,
			statusVariant: "amber",
			source: "outlet",
			sourceLabel: slot.outlet,
			sourceDetail: fill(t.libShift.outletMustConfirmSlot, {
				outlet: slot.outlet,
			}),
			slot,
		};
	}

	if (slot.outletSwap?.status === "pending_pr") {
		return {
			id: slot.id,
			dateIso: slot.dateIso,
			dateLabel: fmtHistDate(y, m, d),
			outlet: slot.outlet,
			time: slot.shift,
			statusLabel: t.libShift.outletSwap,
			statusVariant: "amber",
			source: "agency",
			sourceLabel: agency,
			sourceDetail: fill(t.libShift.swapMoveToOutlet, {
				outlet: slot.outletSwap.targetOutlet,
				note: slot.outletSwap.agencyNote ?? t.libShift.swapRequestFromAgency,
			}),
			slot,
		};
	}

	if (slot.status === "scheduled" || slot.status === "swap-pending") {
		return {
			id: slot.id,
			dateIso: slot.dateIso,
			dateLabel: fmtHistDate(y, m, d),
			outlet: slot.outlet,
			time: slot.shift,
			statusLabel: t.roster.scheduled,
			statusVariant: "green",
			source: "agency",
			sourceLabel: agency,
			sourceDetail: t.libShift.agencyAssignedOnYourRoster,
			slot,
		};
	}

	if (slot.status === "on-duty" || slot.status === "en-route") {
		return {
			id: slot.id,
			dateIso: slot.dateIso,
			dateLabel: fmtHistDate(y, m, d),
			outlet: slot.outlet,
			time: slot.shift,
			// Branch on the STORED status, render the translated word.
			statusLabel:
				slot.status === "on-duty" ? t.roster.onDuty : t.libShift.enRoute,
			statusVariant: "green",
			source: "outlet",
			sourceLabel: slot.outlet,
			sourceDetail: t.libShift.liveShiftFromOutletCheckIn,
			slot,
		};
	}

	return {
		id: slot.id,
		dateIso: slot.dateIso,
		dateLabel: fmtHistDate(y, m, d),
		outlet: slot.outlet,
		time: slot.shift,
		// A status this builder does not know about — the RAW stored value, on
		// purpose. There is no key to look up for a status added server-side, and
		// showing it beats blanking the pill; see the `statusLabel` doc above.
		statusLabel: slot.status,
		statusVariant: "ink",
		source: "agency",
		sourceLabel: agency,
		sourceDetail: t.libShift.agencyRoster,
		slot,
	};
}

function resolveUpcomingEntry(
	up: PrUpcomingShift,
	t: PortalTranslations,
): TimetableEntry {
	const [y, m, d] = up.date;
	const dateIso = dateKeyFromTuple(up.date);
	const confirmed = up.status === "confirmed";

	return {
		id: up.id,
		dateIso,
		dateLabel: fmtHistDate(y, m, d),
		outlet: up.outlet,
		time: up.time,
		statusLabel: confirmed ? t.roster.scheduled : t.libShift.awaitingAgency,
		statusVariant: confirmed ? "green" : "amber",
		source: "agency",
		sourceLabel: DEFAULT_PR_AGENCY_NAME,
		// Shares `agencyProposedNotConfirmed` with buildPrUpcomingEvents — one fact
		// said twice was one fact that could drift into two translations. It also
		// drops the demo agency's name, which a real PR should never read.
		sourceDetail: confirmed
			? fill(t.libShift.outletConfirmedOnBookings, { outlet: up.outlet })
			: t.libShift.agencyProposedNotConfirmed,
		upcoming: up,
	};
}

/** One row per shift — labels whether data came from Atlas Agency or the outlet roster */
export function getUpcomingWeekRange(baselineIso = getLiveTodayIso()): {
	fromIso: string;
	toIso: string;
} {
	return {
		fromIso: baselineIso,
		toIso: addDaysToIso(baselineIso, 6),
	};
}

/**
 * A DATE RANGE, not copy — no `t`, deliberately. It is built from `fmtHistDate`,
 * the shared date helper that already formats against the active locale, and a
 * dictionary key that baked in a month name would be a second source of truth
 * for dates. Its one consumer drops it into `prPortal.timetableForWeek`, whose
 * `{week}` hole is documented as arriving already formatted.
 */
export function formatUpcomingWeekLabel(
	fromIso: string,
	toIso: string,
): string {
	const [fy, fm, fd] = fromIso.split("-").map(Number);
	const [ty, tm, td] = toIso.split("-").map(Number);
	if (fromIso === toIso) return fmtHistDate(fy, fm, fd);
	if (fy === ty && fm === tm) {
		const monthYear = fmtHistDate(fy, fm, fd).split(" ").slice(2).join(" ");
		return `${fd}–${td} ${monthYear}`;
	}
	return `${fmtHistDate(fy, fm, fd)} – ${fmtHistDate(ty, tm, td)}`;
}

export function buildTimetableEntriesInRange(
	prId: string,
	roster: AgencyRosterSlot[],
	upcoming: PrUpcomingShift[],
	fromIso: string,
	toIso: string,
	baselineIso = DEFAULT_ROSTER_DATE_ISO,
	t: PortalTranslations,
): TimetableEntry[] {
	const slots = roster.filter((s) => {
		if (
			s.prId !== prId ||
			s.status === "unavailable" ||
			s.dateIso < baselineIso
		)
			return false;
		return s.dateIso >= fromIso && s.dateIso <= toIso;
	});

	// Named `slot`, not `t` — a map callback called `t` would shadow the locale
	// and every label in `resolveSlotEntry` would read off the wrong object.
	const entries: TimetableEntry[] = slots.map((slot) =>
		resolveSlotEntry(slot, t),
	);

	for (const up of upcoming) {
		const covered = slots.some((s) => slotHasRosterCoverage(s, up));
		if (covered) continue;
		const dateIso = dateKeyFromTuple(up.date);
		if (dateIso < baselineIso || dateIso < fromIso || dateIso > toIso) continue;
		entries.push(resolveUpcomingEntry(up, t));
	}

	return dedupeTimetableEntries(
		entries.sort(
			(a, b) =>
				a.dateIso.localeCompare(b.dateIso) || a.outlet.localeCompare(b.outlet),
		),
	);
}

export function buildUpcomingWeekTimetableEntries(
	prId: string,
	roster: AgencyRosterSlot[],
	upcoming: PrUpcomingShift[],
	baselineIso = getLiveTodayIso(),
	t: PortalTranslations,
): TimetableEntry[] {
	const { fromIso, toIso } = getUpcomingWeekRange(baselineIso);
	return buildTimetableEntriesInRange(
		prId,
		roster,
		upcoming,
		fromIso,
		toIso,
		baselineIso,
		t,
	);
}

export function entryCanCancel(
	entry: TimetableEntry,
	baselineIso = getLiveTodayIso(),
): boolean {
	if (entry.dateIso < baselineIso) return false;
	if (entry.slot) {
		const s = entry.slot.status;
		if (["on-duty", "en-route", "unavailable"].includes(s)) return false;
		return [
			"scheduled",
			"assignment-pending",
			"outlet-pending",
			"swap-pending",
		].includes(s);
	}
	return Boolean(entry.upcoming);
}
