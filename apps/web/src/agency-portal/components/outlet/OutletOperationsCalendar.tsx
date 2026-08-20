import {
	dateFromIsoKey,
	isoKeyFromDate,
} from "@agency-portal/components/iz/HistDateCalendar";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle, IzPill } from "@agency-portal/components/iz/ui";
import {
	OutletShiftDetailPanel,
	OutletShiftStatusBadge,
} from "@agency-portal/components/outlet/OutletShiftDetailPanel";
import { OutletShiftStaffingSection } from "@agency-portal/components/outlet/OutletShiftStaffingSection";
import {
	canDeleteShiftOn,
	useOutletShiftActions,
} from "@agency-portal/hooks/use-outlet-shift-actions";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import {
	outletCalendarShiftRequests,
	resolveOutletShiftDateIso,
} from "@agency-portal/lib/agency-outlet-shifts";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import type { ShiftApplicant } from "@agency-portal/lib/outlet-demo";
import {
	formatShiftEventTypeSummary,
	shiftSpecialEventLabel,
} from "@agency-portal/lib/outlet-demo";
import {
	agencyNameForShift,
	buildShiftStaffRows,
	formatShiftTimeRange,
	shiftStaffingSummary,
	staffingFallbackAgencyName,
} from "@agency-portal/lib/outlet-shift-staffing";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { hasShiftEnded, isShiftLiveNow } from "@agency-portal/lib/shift-window";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import {
	addDays,
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Lock, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/*
 * Column heads, Sunday-first. Resolvers rather than a date formatter: the
 * grid's column ORDER is fixed by the layout, so deriving these from a locale
 * would let the labels and the columns disagree.
 */
const WEEKDAYS: ((t: PortalTranslations) => string)[] = [
	(t) => t.calendar.wdSun,
	(t) => t.calendar.wdMon,
	(t) => t.calendar.wdTue,
	(t) => t.calendar.wdWed,
	(t) => t.calendar.wdThu,
	(t) => t.calendar.wdFri,
	(t) => t.calendar.wdSat,
];

/* `key` is the status enum and stays; only the label resolves. */
const CAL_LEGEND = [
	{
		key: "live",
		label: (t: PortalTranslations) => t.calendar.legendLive,
		className: "live",
	},
	{
		key: "confirmed",
		label: (t: PortalTranslations) => t.calendar.legendConfirmed,
		className: "confirmed",
	},
	/*
	 * No "Open" entry either. `open` is a real enum value the assign and swap
	 * lanes both honour, but NO code path ever writes it: `POST /shift` types
	 * its status variable as `'confirmed' | undefined` and an admin create falls
	 * to the table default `draft`. The only `open` rows in existence come from
	 * `seed-sample-shifts.ts`. A card for one now renders as Confirmed, which is
	 * what an outlet-posted shift awaiting staff actually is.
	 */
	/*
	 * No "Draft" entry: `outletCalendarShiftRequests` filters `status !== "draft"`
	 * before this screen ever sees a shift, so a draft card cannot render and a
	 * legend row for it only invites the reader to look for something that is
	 * not there.
	 */
	/*
	 * "Past", NOT "Sealed". `sealed` is a PAYROLL state in this product — its
	 * action reads "Seal shift · Finalize sales and send payroll to agencies"
	 * and a sealed shift shows a "Payroll sent" pill — so painting every
	 * finished shift "Sealed" would tell a venue its payroll had closed when
	 * nothing of the sort had happened. "Past" says only what the clock knows.
	 * (The seal action is commented out in OutletShiftDetailPanel today, so no
	 * outlet can produce a sealed row at all; a seeded one renders as Past,
	 * which is true of it, just less specific.)
	 */
	{
		key: "past",
		label: (t: PortalTranslations) => t.calendar.legendPast,
		className: "past",
	},
	{
		key: "sealed",
		label: (t: PortalTranslations) => t.calendar.legendSealed,
		className: "sealed",
	},
] as const;

/* A month grid is 5 or 6 weeks depending on where the 1st falls; this pins it. */
const GRID_WEEKS = 6;

/*
 * How many shift cards a day cell shows before collapsing the rest behind a
 * "+N more" chip.
 *
 * ONE, because the month has to fit on one screen. The page gives the grid
 * ~514px at 1512x900 — 81px per row for six rows — while a readable card is
 * 48px. Two cards per cell costs ~148px per row and puts a third of the month
 * below the fold. The "+N more" chip therefore rides in the day-number row,
 * which was otherwise empty, so overflow costs no vertical space at all.
 */
const EVENTS_PER_CELL = 1;

/*
 * Staffing severity. Demand-vs-supplied is the fact this screen exists to
 * report, and it used to render in one flat violet — a shift with 1 of 6 PRs
 * looked exactly like a shift with 6 of 6.
 */
function fillLevel(
	demand: number,
	supplied: number,
): "full" | "short" | "none" {
	// Nothing was asked for, so nothing is missing: never alarm on it.
	if (demand <= 0) return "full";
	if (supplied >= demand) return "full";
	return supplied === 0 ? "none" : "short";
}

type CalendarEvent = {
	shift: ShiftRequest;
	dateIso: string;
	timeRange: string;
	eventType: string;
	demand: number;
	supplied: number;
	pendingCount: number;
	agencyLabel: string;
	bookedNames: string;
};

function buildCalendarEvents(
	shifts: ShiftRequest[],
	roster: AgencyRosterSlot[],
	agencyPRs: AgencyManagedPR[],
	shiftApplicants: ShiftApplicant[],
	todayIso: string,
	/** Name to use when no roster slot names the agency — empty on a real
	 * session, the demo company on a demo one. See `staffingFallbackAgencyName`. */
	fallbackAgency: string,
	t: PortalTranslations,
): CalendarEvent[] {
	return shifts
		.map((shift) => {
			const dateIso = resolveOutletShiftDateIso(
				shift.date,
				shift.dateIso,
				todayIso,
			);
			const agencyName = agencyNameForShift(
				shift,
				roster,
				dateIso,
				fallbackAgency,
			);
			const { demand, supplied, pendingCount } = shiftStaffingSummary(
				shift,
				shiftApplicants,
			);
			const { booked } = buildShiftStaffRows({
				shift,
				dateIso,
				agencyPRs,
				agencyRoster: roster,
				shiftApplicants,
				agencyName,
			});
			const bookedNames =
				booked.length === 0
					? t.calendar.noPrsBooked
					: booked.map((r) => r.name).join(", ");

			return {
				shift,
				dateIso,
				timeRange: formatShiftTimeRange(shift.shift),
				eventType: formatShiftEventTypeSummary(
					shift.eventKind ?? "normal",
					t,
					shift.specialEventType,
					shift.customSpecialEventName,
				),
				demand,
				supplied,
				pendingCount,
				agencyLabel: agencyName,
				bookedNames,
			};
		})
		.sort((a, b) => {
			const dateCmp = a.dateIso.localeCompare(b.dateIso);
			if (dateCmp !== 0) return dateCmp;
			return a.timeRange.localeCompare(b.timeRange);
		});
}

/**
 * Totals for the strip above the grid — the answer the outlet came for, which
 * previously had to be assembled by eye across 42 cells.
 *
 * The staffing numbers count only TODAY ONWARDS. A shift that has already run
 * cannot be staffed, so counting its empty slots as "unfilled" reported a
 * backlog nobody could ever clear — and it grew every day. `shifts` stays a
 * whole-month count because it is a statement about the month, not a workload.
 *
 * `demand`/`supplied` are scoped the same way as `unfilled` deliberately: the
 * strip shows them side by side, so a whole-month "23 of 80 slots filled" next
 * to a future-only unfilled count would visibly fail to subtract.
 */
const ISO_DATE_RE = /^d{4}-d{2}-d{2}$/;

/** Lexicographic compare, but only on a value that really is `YYYY-MM-DD`. */
function isFromTodayOnwards(iso: string, todayIso: string): boolean {
	return ISO_DATE_RE.test(iso) && iso >= todayIso;
}

function monthTotals(events: CalendarEvent[], todayIso: string) {
	let demand = 0;
	let supplied = 0;
	for (const ev of events) {
		if (!isFromTodayOnwards(ev.dateIso, todayIso)) continue;
		demand += ev.demand;
		supplied += ev.supplied;
	}
	return {
		shifts: events.length,
		demand,
		supplied,
		unfilled: Math.max(0, demand - supplied),
	};
}

function formatEventTimeDisplay(timeRange: string): string {
	return timeRange
		.replace(/\s+/g, "")
		.replace(/AM/gi, "a")
		.replace(/PM/gi, "p")
		.toLowerCase();
}

/*
 * What colour is this shift?
 *
 * "Live" and "Past" are derived from the CLOCK, not read off `status`.
 *
 * The old live rule was `status === "confirmed" && shift.date === "Tonight"`,
 * which tested a calendar DAY rather than the shift's window — so a 22:00-04:00
 * shift read "live" at 09:00 and was NOT live at 02:00 while it was actually on
 * the floor. `isShiftLiveNow` is the window test, and it is overnight-aware
 * because most rows here cross midnight.
 *
 * "Past" is derived because a finished shift is not marked as anything by the
 * clock alone: a shift that ran last week still carries `confirmed`. It is
 * distinct from "Sealed", which the venue applies deliberately — see the legend
 * comment above. Both are over; only one was DECLARED over, which is why sealed
 * is checked first.
 *
 * Order matters. Live is checked first: a shift on the floor right now is the
 * most urgent thing the grid can say about a day.
 */
function statusEventClass(shift: ShiftRequest, dateIso: string, now: Date) {
	if (isShiftLiveNow(dateIso, shift.shift, now))
		return "iz-outlet-ops-cal-event--live";
	if (shift.status === "sealed") return "iz-outlet-ops-cal-event--sealed";
	if (hasShiftEnded(dateIso, shift.shift, now))
		return "iz-outlet-ops-cal-event--past";
	return "iz-outlet-ops-cal-event--confirmed";
}

export function OutletOperationsCalendar({
	shifts: shiftsOverride,
	roster: rosterOverride,
	agencyPrs: agencyPrsOverride,
}: {
	/**
	 * Backend-backed shifts + roster + PR records for a real outlet session (see
	 * useOutletToday). They travel together: a shift's `prs` are resolved against
	 * the roster slots and PR records, so overriding one without the others shows
	 * a day with nobody booked. Omitted on demo sessions, which read the store.
	 */
	shifts?: ShiftRequest[];
	roster?: AgencyRosterSlot[];
	agencyPrs?: AgencyManagedPR[];
} = {}) {
	const { t } = usePortalLocale();
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const storeRoster = useStore((s) => s.agencyRoster);
	const storeAgencyPRs = useStore((s) => s.agencyPRs);
	const shiftApplicants = useStore((s) => s.shiftApplicants);
	const storeShifts = useStore((s) => s.shifts);
	const shifts = shiftsOverride ?? storeShifts;
	const agencyRoster = rosterOverride ?? storeRoster;
	const agencyPRs = agencyPrsOverride ?? storeAgencyPRs;
	// A backend roster arrives ONLY on a real outlet session (see the prop doc
	// above), and that is exactly the session that must never be told a demo
	// company supplied its staff. Demo sessions keep naming the demo agency.
	const fallbackAgency = staffingFallbackAgencyName(
		rosterOverride !== undefined,
	);

	// Re-render every 30s so a shift turns green when it STARTS and grey when it
	// ends, rather than at whatever moment the page was last loaded.
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(id);
	}, []);

	const todayIso = getLiveTodayIso();
	const todayDate = useMemo(
		() => dateFromIsoKey(todayIso) ?? new Date(),
		[todayIso],
	);
	const [viewMonth, setViewMonth] = useState(
		() => dateFromIsoKey(todayIso) ?? new Date(),
	);
	const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
	// The day whose full shift list is open, set by a cell's "+N more" chip.
	const [expandedDateIso, setExpandedDateIso] = useState<string | null>(null);
	// Two-step: the first press asks, the second withdraws. A one-press delete on a
	// card the outlet opened to READ is how a night gets cancelled by accident.
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	// Same two-step shape as the withdraw above: ask, then act.
	const [confirmingSeal, setConfirmingSeal] = useState(false);
	const [sealError, setSealError] = useState<string | null>(null);
	const {
		backed: writesBacked,
		deleteShift,
		isDeleting,
		sealShift,
		isSealing,
	} = useOutletShiftActions();
	// Closing a night is an owner/ops act, not a finance one — the same grant the
	// (currently disabled) Seal control on the Today panel gates on.
	const can = useOutletCan();
	const canSeal = can("sealShift");
	// Withdrawing is gated on the permission the SERVER checks: DELETE /shift/:id
	// runs `outletOwnerOrOps`, which is `requirePermission('booking','create')`,
	// and `postJob` is that same grant. Without this the button would be offered
	// to Finance and answered with a 403.
	const canWithdraw = can("postJob");

	const closeSheet = () => {
		setSelectedShiftId(null);
		setConfirmingDelete(false);
		setDeleteError(null);
		setConfirmingSeal(false);
		setSealError(null);
	};

	const visibleShifts = useMemo(
		() =>
			outletCalendarShiftRequests({
				shifts,
				outletName: outletWorkspace.outletName,
				todayIso,
			}),
		[shifts, outletWorkspace.outletName, todayIso],
	);

	const events = useMemo(
		() =>
			buildCalendarEvents(
				visibleShifts,
				agencyRoster,
				agencyPRs,
				shiftApplicants,
				todayIso,
				fallbackAgency,
				t,
			),
		[
			visibleShifts,
			agencyRoster,
			agencyPRs,
			shiftApplicants,
			todayIso,
			fallbackAgency,
			t,
		],
	);

	const eventsByDate = useMemo(() => {
		const map: Record<string, CalendarEvent[]> = {};
		for (const ev of events) {
			(map[ev.dateIso] ??= []).push(ev);
		}
		return map;
	}, [events]);

	const gridDays = useMemo(() => {
		const monthStart = startOfMonth(viewMonth);
		const monthEnd = endOfMonth(viewMonth);
		const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
		// Always SIX weeks, even when the month fits in five. A month-dependent
		// row count makes the whole card jump height as you page through the
		// year (928px in August, 792px in October), which reads as the layout
		// breaking rather than as one fewer week.
		const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
		const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
		while (days.length < GRID_WEEKS * 7) {
			days.push(addDays(days[days.length - 1], 1));
		}
		return days;
	}, [viewMonth]);

	const monthEvents = useMemo(
		() =>
			events.filter((ev) =>
				isSameMonth(dateFromIsoKey(ev.dateIso) ?? new Date(), viewMonth),
			),
		[events, viewMonth],
	);
	const totals = useMemo(
		() => monthTotals(monthEvents, todayIso),
		[monthEvents, todayIso],
	);
	const expandedEvents = expandedDateIso
		? (eventsByDate[expandedDateIso] ?? [])
		: [];

	const selectedShift = selectedShiftId
		? (visibleShifts.find((s) => s.id === selectedShiftId) ?? null)
		: null;

	return (
		<>
			<div className="iz-outlet-ops-cal">
				<div className="iz-outlet-ops-cal-toolbar">
					<div className="iz-outlet-ops-cal-toolbar__left">
						<button
							type="button"
							className="iz-outlet-ops-cal-today"
							// Dead on arrival in the default view: the calendar opens on the
							// current month, so most of the time this button does nothing.
							// Disabled rather than hidden — removing it would shift the nav
							// arrows sideways every time you paged back to today.
							disabled={isSameMonth(viewMonth, todayDate)}
							onClick={() => setViewMonth(todayDate)}
						>
							{t.calendar.today}
						</button>
						<div className="iz-outlet-ops-cal-nav">
							<button
								type="button"
								className="iz-outlet-ops-cal-nav-btn"
								aria-label={t.calendar.previousMonth}
								onClick={() => setViewMonth((m) => subMonths(m, 1))}
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
							<button
								type="button"
								className="iz-outlet-ops-cal-nav-btn"
								aria-label={t.calendar.nextMonth}
								onClick={() => setViewMonth((m) => addMonths(m, 1))}
							>
								<ChevronRight className="h-4 w-4" />
							</button>
						</div>
					</div>

					<h3 className="iz-outlet-ops-cal-month">
						{format(viewMonth, "MMMM yyyy")}
					</h3>

					<div
						className="iz-outlet-ops-cal-legend iz-outlet-ops-cal-legend--toolbar"
						aria-label={t.calendar.statusLegend}
					>
						{CAL_LEGEND.map((item) => (
							<span key={item.key} className="iz-outlet-ops-cal-legend__item">
								<i
									className={cn(
										"iz-outlet-ops-cal-legend__swatch",
										item.className,
									)}
									aria-hidden
								/>
								{item.label(t)}
							</span>
						))}
					</div>
				</div>

				{/* One line that answers "how is this month staffed?". An empty
				    month says so here instead of leaving 42 blank boxes to
				    interpret, and the grid stays on screen so you can keep
				    paging. */}
				<div className="iz-outlet-ops-cal-summary">
					{totals.shifts === 0 ? (
						<span className="iz-outlet-ops-cal-summary__quiet">
							{fill(t.calendar.summaryNoShifts, {
								month: format(viewMonth, "MMMM"),
							})}
						</span>
					) : (
						<>
							<span className="iz-outlet-ops-cal-summary__count">
								{totals.shifts === 1
									? t.calendar.summaryShiftsOne
									: fill(t.calendar.summaryShiftsMany, { n: totals.shifts })}
							</span>
							{totals.demand > 0 && (
								<>
									<span className="iz-outlet-ops-cal-summary__sep" aria-hidden>
										·
									</span>
									<span className="iz-outlet-ops-cal-summary__slots">
										{fill(t.calendar.summarySlots, {
											filled: totals.supplied,
											total: totals.demand,
										})}
									</span>
									<span
										className={cn(
											"iz-outlet-ops-cal-summary__gap",
											totals.unfilled === 0 &&
												"iz-outlet-ops-cal-summary__gap--clear",
										)}
									>
										{totals.unfilled === 0
											? t.calendar.summaryAllStaffed
											: fill(t.calendar.summaryUnfilled, {
													n: totals.unfilled,
												})}
									</span>
								</>
							)}
						</>
					)}
				</div>

				<div className="iz-outlet-ops-cal-weekdays">
					{WEEKDAYS.map((d) => (
						<div key={d(t)} className="iz-outlet-ops-cal-weekday">
							{d(t)}
						</div>
					))}
				</div>

				<div className="iz-outlet-ops-cal-grid">
					{gridDays.map((day) => {
						const iso = isoKeyFromDate(day);
						const dayEvents = eventsByDate[iso] ?? [];
						const inMonth = isSameMonth(day, viewMonth);
						const today = iso === todayIso;

						return (
							<div
								key={iso}
								className={cn(
									"iz-outlet-ops-cal-cell",
									!inMonth && "iz-outlet-ops-cal-cell--outside",
									today && "iz-outlet-ops-cal-cell--today",
								)}
							>
								<div className="iz-outlet-ops-cal-cell-head">
									<span
										className={cn(
											"iz-outlet-ops-cal-day-num",
											today && "iz-outlet-ops-cal-day-num--today",
										)}
									>
										{format(day, "d")}
									</span>
								</div>
								<div className="iz-outlet-ops-cal-events">
									{dayEvents.slice(0, EVENTS_PER_CELL).map((ev) => (
										<button
											key={ev.shift.id}
											type="button"
											className={cn(
												"iz-outlet-ops-cal-event",
												statusEventClass(ev.shift, ev.dateIso, now),
											)}
											onClick={() => setSelectedShiftId(ev.shift.id)}
										>
											<span className="iz-outlet-ops-cal-event-time">
												{formatEventTimeDisplay(ev.timeRange)}
											</span>
											{/* Supplied BEFORE demand, unlike the old
											    "Demand / supplied" box: the first number is
											    the one that changes, and reading it as a
											    fraction of the second is how staffing is
											    spoken about. */}
											<span
												role="img"
												className={cn(
													"iz-outlet-ops-cal-fill",
													`iz-outlet-ops-cal-fill--${fillLevel(ev.demand, ev.supplied)}`,
												)}
												aria-label={fill(t.calendar.staffedAria, {
													supplied: ev.supplied,
													demand: ev.demand,
												})}
											>
												{ev.supplied}/{ev.demand}
											</span>
											<span className="iz-outlet-ops-cal-event-title">
												{ev.shift.event}
											</span>
										</button>
									))}
									{dayEvents.length > EVENTS_PER_CELL && (
										<button
											type="button"
											className="iz-outlet-ops-cal-more"
											aria-label={fill(t.calendar.moreShifts, {
												n: dayEvents.length - EVENTS_PER_CELL,
											})}
											title={fill(t.calendar.moreShifts, {
												n: dayEvents.length - EVENTS_PER_CELL,
											})}
											onClick={() => setExpandedDateIso(iso)}
										>
											+{dayEvents.length - EVENTS_PER_CELL}
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Every shift on one day, reached from that cell's "+N more" chip.
			    Picking a row hands over to the detail sheet below — the cell can
			    only show two cards, so this is the ONLY way to reach the third. */}
			<IzSheet
				open={expandedDateIso !== null}
				onClose={() => setExpandedDateIso(null)}
				variant="dialog"
				wide
			>
				{expandedDateIso && (
					<>
						<IzCardTitle>
							{format(
								dateFromIsoKey(expandedDateIso) ?? new Date(),
								"EEEE d MMMM",
							)}
						</IzCardTitle>
						<div className="mt-3 flex flex-col gap-2">
							{expandedEvents.map((ev) => (
								<button
									key={ev.shift.id}
									type="button"
									className={cn(
										"iz-outlet-ops-cal-daylist-row",
										statusEventClass(ev.shift, ev.dateIso, now),
									)}
									onClick={() => {
										setExpandedDateIso(null);
										setSelectedShiftId(ev.shift.id);
									}}
								>
									<span className="iz-outlet-ops-cal-daylist-row__time">
										{ev.timeRange}
									</span>
									<span className="iz-outlet-ops-cal-daylist-row__title">
										{ev.shift.event}
									</span>
									<span
										role="img"
										className={cn(
											"iz-outlet-ops-cal-fill",
											`iz-outlet-ops-cal-fill--${fillLevel(ev.demand, ev.supplied)}`,
										)}
										aria-label={fill(t.calendar.staffedAria, {
											supplied: ev.supplied,
											demand: ev.demand,
										})}
									>
										{ev.supplied}/{ev.demand}
									</span>
								</button>
							))}
						</div>
					</>
				)}
			</IzSheet>

			<IzSheet
				open={selectedShift !== null}
				onClose={isDeleting || isSealing ? () => {} : closeSheet}
				variant="dialog"
				wide
			>
				{selectedShift &&
					(() => {
						const dateIso = resolveOutletShiftDateIso(
							selectedShift.date,
							selectedShift.dateIso,
							DEFAULT_ROSTER_DATE_ISO,
						);
						const linkedAgency = agencyNameForShift(
							selectedShift,
							agencyRoster,
							dateIso,
							fallbackAgency,
						);
						return (
							<>
								<div className="flex items-start gap-2 pr-6">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<IzCardTitle className="truncate">
												{selectedShift.event}
											</IzCardTitle>
											{selectedShift.eventKind === "special" && (
												<IzPill
													variant="gold"
													className="shrink-0 !py-0.5 !text-[9px]"
												>
													{shiftSpecialEventLabel(
														selectedShift.specialEventType,
														t,
														selectedShift.customSpecialEventName,
													)}
												</IzPill>
											)}
											<OutletShiftStatusBadge shift={selectedShift} />
										</div>
										<p className="iz-tiny iz-muted2 mt-1">
											{selectedShift.date} ·{" "}
											{formatShiftTimeRange(selectedShift.shift)}
										</p>
										{/* The whole line goes when the agency has no name —
										    it read "Agency · " with nothing after it on
										    every real session, since an unassigned shift
										    has no roster slot to name a supplier. */}
										{linkedAgency && (
											<p className="iz-tiny iz-muted2 mt-0.5">
												Agency · {linkedAgency}
											</p>
										)}
									</div>
								</div>
								<OutletShiftDetailPanel
									shift={selectedShift}
									variant="future"
									hideLogSales
									// `undefined`, not "": the panel's prop means "we know the
									// agency", and an empty string would only work there by
									// accident of being falsy.
									staffingAgency={linkedAgency || undefined}
									roster={rosterOverride}
									agencyPrs={agencyPrsOverride}
								/>
								<div className="mt-3 border-t border-[var(--iz-line)] px-1 pt-3">
									<OutletShiftStaffingSection
										shift={selectedShift}
										roster={rosterOverride}
										agencyPrs={agencyPrsOverride}
									/>
								</div>

								{/* Withdrawing a posted shift. Only offered on a real session —
								    a demo shift has no backend row to delete — and only from
								    TOMORROW onwards: `canDeleteShiftOn` is the same rule the
								    server enforces, so this button cannot offer what the API
								    would refuse. Today's shift shows the reason instead of
								    quietly hiding the control, or the outlet is left wondering
								    where it went. */}
								{/* Closing a finished night. InnocenZ does not sit between the
								    outlet and the agency for money, so nothing here can verify a
								    night is done — the venue says so, and this records that it
								    said so. It stops anyone else being added to the shift; it
								    does NOT move or freeze any wage (payment vouchers derive
								    from shift_assignment.status, never from this). Offered only
								    once the shift has actually ended, because the server refuses
								    it before then. */}
								{writesBacked &&
									canSeal &&
									selectedShift.status !== "sealed" &&
									hasShiftEnded(dateIso, selectedShift.shift, now) && (
										<div className="mt-3 border-t border-[var(--iz-line)] px-1 pt-3">
											{sealError && (
												<p className="iz-tiny mb-2 text-[var(--iz-danger,#dc2626)]">
													{sealError}
												</p>
											)}
											{confirmingSeal ? (
												<>
													<p className="iz-tiny iz-muted mb-2 leading-snug">
														{t.calendar.sealThisShift} {t.calendar.sealExplains}
													</p>
													<div className="flex gap-2">
														<button
															type="button"
															className="iz-btn iz-btn-soft iz-btn-sm !w-auto"
															onClick={() => setConfirmingSeal(false)}
															disabled={isSealing}
														>
															{t.calendar.keepOpenShift}
														</button>
														<button
															type="button"
															className="iz-btn iz-btn-primary iz-btn-sm !w-auto"
															disabled={isSealing}
															onClick={async () => {
																setSealError(null);
																try {
																	await sealShift(selectedShift.id);
																	closeSheet();
																} catch (err) {
																	// Stays open on failure — closing here would
																	// look exactly like a seal that landed.
																	setSealError(
																		toMutationError(
																			err,
																			t.calendar.couldNotSeal,
																		)?.message ?? t.calendar.couldNotSeal,
																	);
																}
															}}
														>
															{isSealing
																? t.calendar.sealing
																: t.calendar.sealShift}
														</button>
													</div>
												</>
											) : (
												<button
													type="button"
													className="iz-btn iz-btn-ghost iz-btn-sm !w-auto"
													onClick={() => setConfirmingSeal(true)}
												>
													<Lock className="h-3.5 w-3.5" />
													{t.calendar.sealShift}
												</button>
											)}
										</div>
									)}

								{writesBacked && selectedShift.status === "sealed" && (
									<div className="mt-3 border-t border-[var(--iz-line)] px-1 pt-3">
										<p className="iz-tiny iz-muted2">
											{t.calendar.alreadySealed}
										</p>
									</div>
								)}

								{writesBacked &&
									canWithdraw &&
									(() => {
										const booked = selectedShift.prs?.length ?? 0;
										if (!canDeleteShiftOn(dateIso, todayIso)) {
											return (
												<div className="mt-3 border-t border-[var(--iz-line)] px-1 pt-3">
													<p className="iz-tiny iz-muted2">
														{t.calendar.cannotWithdraw}
													</p>
												</div>
											);
										}
										return (
											<div className="mt-3 border-t border-[var(--iz-line)] px-1 pt-3">
												{deleteError && (
													<p className="iz-tiny mb-2 text-[var(--iz-danger,#dc2626)]">
														{deleteError}
													</p>
												)}
												{confirmingDelete ? (
													<>
														<p className="iz-tiny iz-muted mb-2 leading-snug">
															{t.calendar.withdrawThisShift}
															{booked > 0
																? fill(
																		booked === 1
																			? t.calendar.withdrawLosesOne
																			: t.calendar.withdrawLosesMany,
																		{ n: booked },
																	)
																: t.calendar.withdrawNobodyBooked}{" "}
															{t.calendar.withdrawCannotUndo}
														</p>
														<div className="flex gap-2">
															<button
																type="button"
																className="iz-btn iz-btn-soft iz-btn-sm !w-auto"
																onClick={() => setConfirmingDelete(false)}
																disabled={isDeleting}
															>
																{t.calendar.keepShift}
															</button>
															<button
																type="button"
																className="iz-btn iz-btn-danger iz-btn-sm !w-auto"
																disabled={isDeleting}
																onClick={async () => {
																	setDeleteError(null);
																	try {
																		await deleteShift(selectedShift.id);
																		closeSheet();
																	} catch (err) {
																		// Stays open on failure: closing here would
																		// look exactly like a delete that landed.
																		setDeleteError(
																			toMutationError(
																				err,
																				t.calendar.couldNotWithdraw,
																			)?.message ?? t.calendar.couldNotWithdraw,
																		);
																	}
																}}
															>
																{isDeleting
																	? t.calendar.withdrawing
																	: t.calendar.withdrawShift}
															</button>
														</div>
													</>
												) : (
													<button
														type="button"
														className="iz-btn iz-btn-ghost iz-btn-sm !w-auto"
														onClick={() => setConfirmingDelete(true)}
													>
														<Trash2 className="h-3.5 w-3.5" />
														{t.calendar.withdrawShift}
													</button>
												)}
											</div>
										);
									})()}
							</>
						);
					})()}
			</IzSheet>
		</>
	);
}
