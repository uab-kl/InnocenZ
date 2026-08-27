import {
	calendarNavBounds,
	dateFromIsoKey,
	isoKeyFromDate,
	MONTH_INDEXES,
} from "@agency-portal/components/iz/HistDateCalendar";
import { PrStatusPill } from "@agency-portal/components/pr/PrOfferRow";
import {
	cancellationBandRows,
	PrShiftCancellationSheet,
} from "@agency-portal/components/pr/PrShiftCancellationSheet";
import { Button } from "@agency-portal/components/ui/button";
import { Calendar as CalendarUi } from "@agency-portal/components/ui/calendar";
import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import {
	buildPrScheduleDays,
	buildUpcomingWeekTimetableEntries,
	dayCanToggleAvailability,
	entryCanCancel,
	formatUpcomingWeekLabel,
	getAgencyScheduleFromIso,
	getAgencyScheduleToIso,
	getUpcomingWeekRange,
	type ShiftDataSource,
	type TimetableEntry,
} from "@agency-portal/lib/pr-agency-schedule";
import type { PrUpcomingShift } from "@agency-portal/lib/pr-features";
import {
	CANCEL_RULES,
	evaluateShiftCancellation,
} from "@agency-portal/lib/pr-schedule-cancellation";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import {
	AlertTriangle,
	Building2,
	CalendarDays,
	ChevronDown,
	Clock,
	Shield,
} from "lucide-react";
import {
	type ComponentProps,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { DayButton } from "react-day-picker";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { monthLongLabel } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";

/** Fills each grid cell — shared CalendarDayButton uses size="icon" (36×36px) and overlaps on mobile. */
function PrScheduleDayButton({
	className,
	day,
	modifiers,
	...props
}: ComponentProps<typeof DayButton>) {
	const ref = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	return (
		<Button
			ref={ref}
			variant="ghost"
			data-day={day.date.toLocaleDateString()}
			data-selected-single={
				modifiers.selected &&
				!modifiers.range_start &&
				!modifiers.range_end &&
				!modifiers.range_middle
			}
			data-range-start={modifiers.range_start}
			data-range-end={modifiers.range_end}
			data-range-middle={modifiers.range_middle}
			className={cn(
				"iz-pr-cal-day-btn group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px]",
				className,
			)}
			{...props}
		/>
	);
}

export function PrAgencySchedulePanel({
	prId,
	roster,
	upcoming,
	onCancelShift,
}: {
	prId: string;
	roster: AgencyRosterSlot[];
	upcoming: PrUpcomingShift[];
	onCancelShift: (entry: TimetableEntry, reason: string) => void;
}) {
	const { t } = usePortalLocale();
	const scheduleDays = useMemo(
		() => buildPrScheduleDays(prId, roster, upcoming),
		[prId, roster, upcoming],
	);
	const dayByIso = useMemo(
		() => new Map(scheduleDays.map((d) => [d.dateIso, d])),
		[scheduleDays],
	);

	const defaultMonth = dateFromIsoKey(getLiveTodayIso()) ?? new Date();
	const [viewMonth, setViewMonth] = useState(defaultMonth);
	const [rulesOpen, setRulesOpen] = useState(false);
	const [selectedIso, setSelectedIso] = useState<string | null>(null);
	const [cancelEntry, setCancelEntry] = useState<TimetableEntry | null>(null);
	const [cancelReason, setCancelReason] = useState("");
	const togglePrDayAvailability = useStore((s) => s.togglePrDayAvailability);

	const navBounds = useMemo(
		() =>
			calendarNavBounds(
				scheduleDays.map((d) => ({ key: d.dateIso })),
				defaultMonth,
			),
		[scheduleDays, defaultMonth],
	);

	useEffect(() => {
		setViewMonth((m) => {
			if (m >= navBounds.startMonth && m <= navBounds.endMonth) return m;
			return defaultMonth;
		});
	}, [navBounds, defaultMonth]);

	const minY = navBounds.startMonth.getFullYear();
	const maxY = navBounds.endMonth.getFullYear();
	const years = Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i);

	const upcomingWeekRange = useMemo(() => getUpcomingWeekRange(), []);
	const upcomingWeekLabel = useMemo(
		() =>
			formatUpcomingWeekLabel(
				upcomingWeekRange.fromIso,
				upcomingWeekRange.toIso,
			),
		[upcomingWeekRange],
	);

	const upcomingWeekTimetable = useMemo(
		() =>
			buildUpcomingWeekTimetableEntries(
				prId,
				roster,
				upcoming,
				// `undefined` selects the default baseline (today); it is the only
				// way to reach `t`, which sits after it.
				undefined,
				t,
			),
		[prId, roster, upcoming, t],
	);

	const cancelSlot = cancelEntry?.slot;
	const cancelEval =
		cancelSlot &&
		evaluateShiftCancellation(
			new Date(),
			cancelSlot.dateIso,
			cancelSlot.shiftStart,
			cancelSlot.estPayout ?? CANCEL_RULES.defaultDailyWagesRm,
		);

	const handleDaySelect = (date: Date | undefined) => {
		if (!date) return;
		const iso = isoKeyFromDate(date);
		const day = dayByIso.get(iso);
		if (!day || day.kind === "past") return;

		if (dayCanToggleAvailability(day)) {
			togglePrDayAvailability(iso);
			return;
		}

		setSelectedIso((cur) => (cur === iso ? null : iso));
	};

	const submitCancel = () => {
		if (!cancelEntry || !cancelReason.trim()) return;
		onCancelShift(cancelEntry, cancelReason);
		setCancelEntry(null);
		setCancelReason("");
	};

	return (
		<div className="iz-pr-schedule">
			<div className="iz-pr-schedule-rules">
				<button
					type="button"
					className="iz-pr-schedule-rules-hd"
					onClick={() => setRulesOpen((o) => !o)}
					aria-expanded={rulesOpen}
				>
					<AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-amber)]" />
					<span className="text-left">
						<span className="block text-xs font-bold uppercase tracking-wide text-[var(--iz-txt)]">
							{t.prPortal.cancellationRules}
						</span>
					</span>
					<ChevronDown
						className={cn(
							"h-4 w-4 shrink-0 transition-transform",
							rulesOpen && "rotate-180",
						)}
					/>
				</button>
				{rulesOpen && (
					<ul className="iz-pr-schedule-rules-list">
						{cancellationBandRows(t).map((r) => (
							<li key={r.id} className={`tone-${r.tone}`}>
								<span className="rule-when">{r.label}</span>
								<span className="rule-out">{r.outcome}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="iz-pr-schedule-cal-wrap">
				<div className="iz-hist-cal-nav mb-2">
					<label className="iz-hist-cal-nav-field">
						<span className="iz-hist-cal-nav-label">{t.izPv.month}</span>
						<span className="iz-hist-cal-select-wrap">
							<select
								className="iz-hist-cal-select"
								value={viewMonth.getMonth()}
								aria-label={t.izPv.chooseMonth}
								onChange={(e) =>
									setViewMonth(
										new Date(
											viewMonth.getFullYear(),
											Number(e.target.value),
											1,
										),
									)
								}
							>
								{MONTH_INDEXES.map((i) => (
									<option key={i} value={i}>
										{monthLongLabel(i, t)}
									</option>
								))}
							</select>
							<ChevronDown className="iz-hist-cal-select-icon" aria-hidden />
						</span>
					</label>
					<label className="iz-hist-cal-nav-field">
						<span className="iz-hist-cal-nav-label">{t.izPv.year}</span>
						<span className="iz-hist-cal-select-wrap">
							<select
								className="iz-hist-cal-select"
								value={viewMonth.getFullYear()}
								aria-label={t.izPv.chooseYear}
								onChange={(e) =>
									setViewMonth(
										new Date(Number(e.target.value), viewMonth.getMonth(), 1),
									)
								}
							>
								{years.map((y) => (
									<option key={y} value={y}>
										{y}
									</option>
								))}
							</select>
							<ChevronDown className="iz-hist-cal-select-icon" aria-hidden />
						</span>
					</label>
				</div>
				<CalendarUi
					mode="single"
					hideNavigation
					month={viewMonth}
					onMonthChange={setViewMonth}
					startMonth={navBounds.startMonth}
					endMonth={navBounds.endMonth}
					selected={undefined}
					onSelect={handleDaySelect}
					components={{ DayButton: PrScheduleDayButton }}
					disabled={(date) => {
						const iso = isoKeyFromDate(date);
						const fromIso = getAgencyScheduleFromIso();
						const toIso = getAgencyScheduleToIso();
						if (iso < fromIso || iso > toIso) return true;
						const day = dayByIso.get(iso);
						return day?.kind === "past";
					}}
					modifiers={{
						open: (d) => dayByIso.get(isoKeyFromDate(d))?.kind === "open",
						assigned: (d) =>
							dayByIso.get(isoKeyFromDate(d))?.kind === "assigned",
						pending: (d) => dayByIso.get(isoKeyFromDate(d))?.kind === "pending",
						unavailable: (d) =>
							dayByIso.get(isoKeyFromDate(d))?.kind === "unavailable",
						active: (d) => dayByIso.get(isoKeyFromDate(d))?.kind === "active",
						picked: (d) => selectedIso === isoKeyFromDate(d),
						togglable: (d) => {
							const day = dayByIso.get(isoKeyFromDate(d));
							return day ? dayCanToggleAvailability(day) : false;
						},
					}}
					modifiersClassNames={{
						open: "iz-pr-cal-open",
						assigned: "iz-pr-cal-assigned",
						pending: "iz-pr-cal-pending",
						unavailable: "iz-pr-cal-unavailable",
						active: "iz-pr-cal-active",
						picked: "iz-pr-cal-picked",
						togglable: "iz-pr-cal-togglable",
					}}
					classNames={{
						month_caption: "hidden",
						nav: "hidden",
						root: "iz-pr-schedule-cal w-full max-w-full",
						month: "w-full gap-2",
						month_grid: "iz-pr-cal-grid w-full",
						weeks: "w-full",
						weekdays: "iz-pr-cal-weekdays",
						weekday: "iz-pr-cal-weekday",
						week: "iz-pr-cal-week",
						day: "iz-pr-cal-day group/day",
						day_button: "iz-pr-cal-day-btn",
					}}
					className="w-full p-0 [--cell-size:100%]"
				/>
				<div className="iz-pr-cal-legend">
					<span>
						<i className="sw open" /> {t.prPortal.legendAvailable}
					</span>
					<span>
						<i className="sw assigned" /> {t.prPortal.legendScheduled}
					</span>
					<span>
						<i className="sw pending" /> {t.prPortal.legendPending}
					</span>
					<span>
						<i className="sw unavailable" /> {t.prPortal.legendNotAvailable}
					</span>
				</div>
				<p className="iz-tiny iz-muted2 mt-2 text-center">
					{t.prPortal.tapDayToBlockHint}
				</p>
			</div>

			<div className="iz-pr-schedule-timetable">
				<div className="flex items-center gap-2 mb-2">
					<Clock className="h-4 w-4 text-[var(--iz-muted2)]" />
					<span className="text-xs font-bold uppercase tracking-wide text-[var(--iz-muted)]">
						{fill(t.prPortal.timetableForWeek, { week: upcomingWeekLabel })}
					</span>
				</div>
				{upcomingWeekTimetable.length === 0 ? (
					<p className="iz-tiny iz-muted2 rounded-xl border border-dashed border-[var(--iz-line)] px-3 py-5 text-center">
						{t.prPortal.noShiftsThisWeek}
					</p>
				) : (
					<div className="iz-pr-list">
						{upcomingWeekTimetable.map((entry) => (
							<TimetableRow
								key={entry.id}
								entry={entry}
								onCancel={() => setCancelEntry(entry)}
							/>
						))}
					</div>
				)}
			</div>

			<PrShiftCancellationSheet
				open={cancelEntry !== null}
				onClose={() => {
					setCancelEntry(null);
					setCancelReason("");
				}}
				title={t.prPortal.cancelShift}
				outlet={cancelEntry?.outlet ?? ""}
				dateLine={cancelEntry?.dateLabel ?? ""}
				shiftLine={cancelEntry?.time}
				evaluation={cancelEval ?? null}
				reason={cancelReason}
				onReasonChange={setCancelReason}
				onSubmit={submitCancel}
				submitLabel={
					cancelEval && cancelEval.deductionRm > 0
						? fill(t.prPortal.cancelAndAcceptDeduction, {
								amount: `RM ${cancelEval.deductionRm}`,
							})
						: t.prPortal.cancelShift
				}
			/>
		</div>
	);
}

function SourceBadge({
	source,
	label,
}: {
	source: ShiftDataSource;
	label: string;
}) {
	const { t } = usePortalLocale();
	const isAgency = source === "agency";
	return (
		<span
			className={cn("iz-pr-source-badge", isAgency ? "is-agency" : "is-outlet")}
		>
			{isAgency ? (
				<Shield className="h-3 w-3" />
			) : (
				<Building2 className="h-3 w-3" />
			)}
			{isAgency ? t.history.portalAgency : t.history.portalOutlet} · {label}
		</span>
	);
}

function TimetableRow({
	entry,
	onCancel,
}: {
	entry: TimetableEntry;
	onCancel: () => void;
}) {
	const { t } = usePortalLocale();
	const slot = entry.slot;

	return (
		<div className="iz-pr-inbox-card">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<SourceBadge source={entry.source} label={entry.sourceLabel} />
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted2)]" />
						<span className="font-sora text-sm font-bold">{entry.outlet}</span>
						<PrStatusPill variant={entry.statusVariant}>
							{entry.statusLabel}
						</PrStatusPill>
					</div>
					<dl className="mt-2 space-y-1.5">
						<div>
							<dt className="iz-tiny iz-muted2 uppercase tracking-wide">
								{t.filters.date}
							</dt>
							<dd className="iz-tiny iz-muted mt-0.5">{entry.dateLabel}</dd>
						</div>
						<div>
							<dt className="iz-tiny iz-muted2 uppercase tracking-wide">
								{t.postJob.time}
							</dt>
							<dd className="iz-tiny iz-muted mt-0.5">{entry.time}</dd>
						</div>
					</dl>
					{slot?.payDeductionRm ? (
						<p className="iz-tiny mt-2 text-[var(--iz-red)]">
							{fill(t.prPortal.deductionLoggedAt, {
								amount: `RM ${slot.payDeductionRm}`,
								at: slot.cancelledAt ?? "",
							})}
						</p>
					) : null}
				</div>
			</div>
			{entryCanCancel(entry) && (
				<button
					type="button"
					className="iz-btn iz-btn-danger iz-btn-sm mt-2 w-full"
					onClick={onCancel}
				>
					{t.common.cancel}
				</button>
			)}
		</div>
	);
}
