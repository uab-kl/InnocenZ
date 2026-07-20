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
} from "@agency-portal/lib/outlet-shift-staffing";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import {
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const CAL_LEGEND = [
	{ key: "live", label: "Live", className: "live" },
	{ key: "confirmed", label: "Confirmed", className: "confirmed" },
	{ key: "open", label: "Open", className: "open" },
	{ key: "draft", label: "Draft", className: "draft" },
] as const;

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
): CalendarEvent[] {
	return shifts
		.map((shift) => {
			const dateIso = resolveOutletShiftDateIso(
				shift.date,
				shift.dateIso,
				todayIso,
			);
			const agencyName = agencyNameForShift(shift, roster, dateIso);
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
					? "No PRs booked"
					: booked.map((r) => r.name).join(", ");

			return {
				shift,
				dateIso,
				timeRange: formatShiftTimeRange(shift.shift),
				eventType: formatShiftEventTypeSummary(
					shift.eventKind ?? "normal",
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

function formatEventTimeDisplay(timeRange: string): string {
	return timeRange
		.replace(/\s+/g, "")
		.replace(/AM/gi, "a")
		.replace(/PM/gi, "p")
		.toLowerCase();
}

function isShiftLiveTonight(shift: ShiftRequest): boolean {
	return shift.status === "confirmed" && shift.date === "Tonight";
}

function statusEventClass(shift: ShiftRequest) {
	if (isShiftLiveTonight(shift)) return "iz-outlet-ops-cal-event--live";
	if (shift.status === "confirmed") return "iz-outlet-ops-cal-event--confirmed";
	if (shift.status === "open") return "iz-outlet-ops-cal-event--open";
	if (shift.status === "sealed") return "iz-outlet-ops-cal-event--sealed";
	return "iz-outlet-ops-cal-event--draft";
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
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const storeRoster = useStore((s) => s.agencyRoster);
	const storeAgencyPRs = useStore((s) => s.agencyPRs);
	const shiftApplicants = useStore((s) => s.shiftApplicants);
	const storeShifts = useStore((s) => s.shifts);
	const shifts = shiftsOverride ?? storeShifts;
	const agencyRoster = rosterOverride ?? storeRoster;
	const agencyPRs = agencyPrsOverride ?? storeAgencyPRs;

	const todayIso = getLiveTodayIso();
	const [viewMonth, setViewMonth] = useState(
		() => dateFromIsoKey(todayIso) ?? new Date(),
	);
	const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

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
			),
		[visibleShifts, agencyRoster, agencyPRs, shiftApplicants, todayIso],
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
		const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
		return eachDayOfInterval({ start: gridStart, end: gridEnd });
	}, [viewMonth]);

	const selectedShift = selectedShiftId
		? (visibleShifts.find((s) => s.id === selectedShiftId) ?? null)
		: null;

	if (visibleShifts.length === 0) {
		return (
			<p className="iz-tiny iz-muted rounded-2xl border border-dashed border-[var(--iz-line)] px-4 py-8 text-center">
				No upcoming shifts — use Post Job to create one.
			</p>
		);
	}

	return (
		<>
			<div className="iz-outlet-ops-cal">
				<div className="iz-outlet-ops-cal-toolbar">
					<div className="iz-outlet-ops-cal-toolbar__left">
						<button
							type="button"
							className="iz-outlet-ops-cal-today"
							onClick={() =>
								setViewMonth(dateFromIsoKey(todayIso) ?? new Date())
							}
						>
							Today
						</button>
						<div className="iz-outlet-ops-cal-nav">
							<button
								type="button"
								className="iz-outlet-ops-cal-nav-btn"
								aria-label="Previous month"
								onClick={() => setViewMonth((m) => subMonths(m, 1))}
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
							<button
								type="button"
								className="iz-outlet-ops-cal-nav-btn"
								aria-label="Next month"
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
						aria-label="Shift status legend"
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
								{item.label}
							</span>
						))}
					</div>
				</div>

				<div className="iz-outlet-ops-cal-weekdays">
					{WEEKDAYS.map((d) => (
						<div key={d} className="iz-outlet-ops-cal-weekday">
							{d}
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
									{dayEvents.map((ev) => (
										<button
											key={ev.shift.id}
											type="button"
											className={cn(
												"iz-outlet-ops-cal-event",
												statusEventClass(ev.shift),
											)}
											onClick={() => setSelectedShiftId(ev.shift.id)}
										>
											<div className="iz-outlet-ops-cal-event-top">
												<span className="iz-outlet-ops-cal-event-time">
													{formatEventTimeDisplay(ev.timeRange)}
												</span>
											</div>
											<span className="iz-outlet-ops-cal-event-title">
												{ev.shift.event}
											</span>
											<div
												className="iz-outlet-ops-cal-event-stats"
												aria-label={`${ev.demand} demand, ${ev.supplied} supplied`}
											>
												<span className="iz-outlet-ops-cal-event-stats__label">
													Demand / supplied
												</span>
												<span className="iz-outlet-ops-cal-event-stats__nums">
													<span className="iz-outlet-ops-cal-event-stats__demand">
														{ev.demand}
													</span>
													<span className="iz-outlet-ops-cal-event-stats__sep">
														/
													</span>
													<span className="iz-outlet-ops-cal-event-stats__supplied">
														{ev.supplied}
													</span>
												</span>
											</div>
										</button>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<IzSheet
				open={selectedShift !== null}
				onClose={() => setSelectedShiftId(null)}
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
										<p className="iz-tiny iz-muted2 mt-0.5">
											Agency · {linkedAgency}
										</p>
									</div>
								</div>
								<OutletShiftDetailPanel
									shift={selectedShift}
									variant="future"
									hideLogSales
									staffingAgency={linkedAgency}
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
							</>
						);
					})()}
			</IzSheet>
		</>
	);
}
