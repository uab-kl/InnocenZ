import {
	dateFromIsoKey,
	isoKeyFromDate,
} from "@agency-portal/components/iz/HistDateCalendar";
import {
	Calendar,
	CalendarDayButton,
} from "@agency-portal/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@agency-portal/components/ui/popover";
import { cn } from "@agency-portal/lib/utils";
import { addMonths, startOfToday, subMonths } from "date-fns";
import {
	CalendarIcon,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalLocale } from "@/lib/portal-i18n/locale-prefs";

/**
 * "27 Aug 2026" / "2026年8月27日" — the outlet portal's dated field value.
 *
 * `locale` is a required LAST parameter, not an optional one. A module-scope
 * function cannot call `usePortalLocale`, and a default would pin the portal to
 * one language for every caller that forgot to pass it — which is exactly how
 * this label stayed English behind the language switch.
 */
export function formatOutletDateLabel(
	value: Date | string,
	locale: PortalLocale,
): string {
	const d = typeof value === "string" ? dateFromIsoKey(value) : value;
	if (!d) return typeof value === "string" ? value : "";
	return d.toLocaleDateString(dateLocaleTag(locale), {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

const compactCalClass =
	"iz-outlet-report-cal-picker iz-outlet-report-cal-picker--popover p-0 [--cell-size:2rem]";

const compactCalClassNames = {
	root: "w-fit",
	months: "gap-0",
	month: "gap-1",
	month_caption: "h-7 !text-xs",
	caption_label: "!text-xs",
	nav: "h-7",
	button_previous: "!h-7 !w-7",
	button_next: "!h-7 !w-7",
	weekdays: "gap-0",
	weekday:
		"w-[var(--cell-size)] flex-none p-0 text-center !text-[10px] font-medium text-[var(--iz-muted)]",
	week: "mt-0.5 gap-0",
	day: "h-[var(--cell-size)] w-[var(--cell-size)] flex-none p-0",
} as const;

type RangeHighlight = {
	startIso: string;
	endIso: string;
	/** User picked start and is choosing end — only start should read as anchored */
	pickingEnd?: boolean;
};

function RangeSelectionLegend({
	start,
	end,
	pickingEnd,
}: {
	start: Date;
	end: Date | null;
	pickingEnd: boolean;
}) {
	const { t, locale } = usePortalLocale();
	return (
		<div className="iz-outlet-report-range-legend" aria-live="polite">
			<div className="iz-outlet-report-range-legend-item is-start">
				<span className="iz-outlet-report-range-legend-badge">S</span>
				<div className="min-w-0">
					<span className="iz-outlet-report-range-legend-label">
						{t.datePicker.start}
					</span>
					<span className="iz-outlet-report-range-legend-value">
						{formatOutletDateLabel(start, locale)}
					</span>
				</div>
			</div>
			<span className="iz-outlet-report-range-legend-arrow" aria-hidden>
				→
			</span>
			<div
				className={cn(
					"iz-outlet-report-range-legend-item is-end",
					pickingEnd && "is-pending",
				)}
			>
				<span className="iz-outlet-report-range-legend-badge">E</span>
				<div className="min-w-0">
					<span className="iz-outlet-report-range-legend-label">
						{t.datePicker.end}
					</span>
					<span className="iz-outlet-report-range-legend-value">
						{end ? formatOutletDateLabel(end, locale) : t.datePicker.tapADay}
					</span>
				</div>
			</div>
		</div>
	);
}

function startOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function dayBefore(a: Date, b: Date): boolean {
	return startOfDay(a).getTime() < startOfDay(b).getTime();
}

function normalizeRange(a: Date, b: Date): { from: Date; to: Date } {
	const start = startOfDay(a);
	const end = startOfDay(b);
	if (end < start) return { from: end, to: start };
	return { from: start, to: end };
}

export function OutletCompactRangeCalendar({
	rangeFrom,
	rangeTo,
	defaultMonth,
	startMonth,
	endMonth,
	onRangeSelect,
	disabled,
}: {
	rangeFrom?: Date;
	rangeTo?: Date;
	defaultMonth?: Date;
	startMonth?: Date;
	endMonth?: Date;
	onRangeSelect: (from: Date, to: Date | undefined) => void;
	disabled?: (date: Date) => boolean;
}) {
	const selected: DateRange | undefined = rangeFrom
		? { from: rangeFrom, to: rangeTo }
		: undefined;

	return (
		<Calendar
			mode="range"
			selected={selected}
			defaultMonth={defaultMonth ?? rangeFrom ?? rangeTo}
			startMonth={startMonth}
			endMonth={endMonth}
			disabled={disabled}
			onSelect={(range) => {
				if (!range?.from) return;
				onRangeSelect(range.from, range.to);
			}}
			className={compactCalClass}
			classNames={compactCalClassNames}
		/>
	);
}

export function OutletDateRangePopover({
	from,
	to,
	onRangeChange,
	disabled,
	startMonth,
	endMonth,
	formatRangeLabel,
	className,
	fieldLabel,
	compact,
}: {
	from: Date;
	to: Date;
	onRangeChange: (from: Date, to: Date) => void;
	disabled?: (date: Date) => boolean;
	startMonth?: Date;
	endMonth?: Date;
	formatRangeLabel: (from: Date, to: Date) => string;
	className?: string;
	fieldLabel?: string;
	compact?: boolean;
}) {
	const { t } = usePortalLocale();
	// Resolved here, not in the parameter list: a default parameter is
	// evaluated before hooks run and cannot read the dictionary.
	const rangeFieldLabel = fieldLabel ?? t.datePicker.dateRange;
	const [open, setOpen] = useState(false);
	const [draftStart, setDraftStart] = useState<Date | null>(null);
	const [awaitingEnd, setAwaitingEnd] = useState(false);

	useEffect(() => {
		if (open) {
			setDraftStart(from);
			setAwaitingEnd(false);
		}
	}, [open, from]);

	const previewRange = useMemo((): RangeHighlight | undefined => {
		if (!draftStart) return undefined;
		if (awaitingEnd) {
			const iso = isoKeyFromDate(draftStart);
			return { startIso: iso, endIso: iso, pickingEnd: true };
		}
		const n = normalizeRange(draftStart, to);
		return {
			startIso: isoKeyFromDate(n.from),
			endIso: isoKeyFromDate(n.to),
			pickingEnd: false,
		};
	}, [awaitingEnd, draftStart, to]);

	const legendStart = draftStart ?? from;
	const legendEnd = awaitingEnd ? null : to;

	const commitRange = (start: Date, end: Date) => {
		const n = normalizeRange(start, end);
		onRangeChange(n.from, n.to);
		setOpen(false);
	};

	const handleDaySelect = (day: Date) => {
		if (disabled?.(day)) return;
		if (!awaitingEnd) {
			setDraftStart(day);
			setAwaitingEnd(true);
			return;
		}
		const start = draftStart ?? day;
		if (dayBefore(day, start)) {
			setDraftStart(day);
			return;
		}
		commitRange(start, day);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						compact
							? "iz-chip flex items-center gap-1.5 py-1.5 pl-2.5 pr-2 text-sm font-semibold text-[var(--iz-txt)]"
							: cn(
									"iz-outlet-report-range-target iz-outlet-report-range-combined",
									open && "is-active",
									className,
								),
					)}
					aria-label={t.datePicker.chooseDateRange}
				>
					{compact ? (
						<>
							<CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold)]" />
							<span className="whitespace-nowrap">
								{formatRangeLabel(from, to)}
							</span>
							<ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)]" />
						</>
					) : (
						<>
							<span className="iz-outlet-report-range-target-label">
								{rangeFieldLabel}
							</span>
							<span className="iz-outlet-report-range-target-value">
								{formatRangeLabel(from, to)}
							</span>
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="iz-outlet-report-cal-popover w-auto border-[var(--iz-line)] bg-[var(--iz-panel)] p-2"
				data-range-step={awaitingEnd ? "end" : "start"}
			>
				<RangeSelectionLegend
					start={legendStart}
					end={legendEnd}
					pickingEnd={awaitingEnd}
				/>
				<div className="mb-2 mt-2 flex flex-wrap items-center gap-2 px-0.5">
					<p className="iz-tiny iz-muted2">
						{awaitingEnd ? t.datePicker.step2 : t.datePicker.step1}
					</p>
					{awaitingEnd && draftStart && (
						<button
							type="button"
							className="iz-chip ml-auto px-2 py-0.5 text-[10px] font-semibold text-[var(--iz-gold-l)]"
							onClick={() => commitRange(draftStart, draftStart)}
						>
							{t.datePicker.singleDay}
						</button>
					)}
				</div>
				<OutletCompactCalendar
					selected={awaitingEnd ? undefined : (draftStart ?? from)}
					defaultMonth={draftStart ?? from}
					startMonth={startMonth}
					endMonth={endMonth}
					disabled={disabled}
					range={previewRange}
					onSelect={handleDaySelect}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function OutletCompactCalendar({
	selected,
	defaultMonth,
	startMonth,
	endMonth,
	onSelect,
	disabled,
	range,
}: {
	selected?: Date;
	defaultMonth?: Date;
	startMonth?: Date;
	endMonth?: Date;
	onSelect: (day: Date) => void;
	disabled?: (date: Date) => boolean;
	range?: RangeHighlight;
}) {
	return (
		<Calendar
			mode="single"
			selected={selected}
			defaultMonth={defaultMonth}
			startMonth={startMonth}
			endMonth={endMonth}
			onSelect={(day) => {
				if (day) onSelect(day);
			}}
			disabled={disabled}
			modifiers={
				range
					? {
							reportRangeStart: (date) =>
								isoKeyFromDate(date) === range.startIso,
							reportRangeEnd: (date) =>
								!range.pickingEnd &&
								isoKeyFromDate(date) === range.endIso &&
								range.endIso !== range.startIso,
							reportRangeMiddle: (date) => {
								if (range.pickingEnd) return false;
								const iso = isoKeyFromDate(date);
								return iso > range.startIso && iso < range.endIso;
							},
						}
					: undefined
			}
			modifiersClassNames={
				range
					? {
							reportRangeStart: "iz-report-range-start",
							reportRangeEnd: "iz-report-range-end",
							reportRangeMiddle: "iz-report-range-middle",
						}
					: undefined
			}
			className={compactCalClass}
			classNames={compactCalClassNames}
		/>
	);
}

function MultiDateSelectionLegend({
	selectedIsos,
	summary,
}: {
	selectedIsos: string[];
	summary: string;
}) {
	const { t } = usePortalLocale();
	return (
		<div
			className="iz-outlet-report-range-legend !grid-cols-1"
			aria-live="polite"
		>
			<div className="iz-outlet-report-range-legend-item is-start !col-span-1">
				<span className="iz-outlet-report-range-legend-badge">✓</span>
				<div className="min-w-0">
					<span className="iz-outlet-report-range-legend-label">
						{t.datePicker.selected}
					</span>
					<span className="iz-outlet-report-range-legend-value">
						{selectedIsos.length === 0
							? t.datePicker.noDatesYet
							: fill(
									selectedIsos.length === 1
										? t.datePicker.datesCountOne
										: t.datePicker.datesCountMany,
									{ n: selectedIsos.length },
								)}
					</span>
					{summary && (
						<span className="iz-tiny iz-muted2 mt-0.5 block leading-snug">
							{summary}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

export type MultiDateQuickSpanOption = {
	id: string;
	label: string;
};

export type MultiDateQuickSpanHandlers = {
	spans: MultiDateQuickSpanOption[];
	isActive: (anchor: Date, spanId: string) => boolean;
	onApply: (anchor: Date, spanId: string) => void;
};

const DOUBLE_TAP_MS = 320;

function MultiCalendarHeader({
	month,
	onMonthChange,
	quickSpans,
	spanAnchor,
}: {
	month: Date;
	onMonthChange: (month: Date) => void;
	quickSpans?: MultiDateQuickSpanHandlers;
	spanAnchor: Date;
}) {
	const { t, locale } = usePortalLocale();
	return (
		<div className="iz-multi-cal-header mb-1">
			<div className="flex items-center gap-1">
				<button
					type="button"
					className="iz-multi-cal-nav-btn"
					aria-label={t.datePicker.previousMonth}
					onClick={() => onMonthChange(subMonths(month, 1))}
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="iz-multi-cal-nav-btn"
					aria-label={t.datePicker.nextMonth}
					onClick={() => onMonthChange(addMonths(month, 1))}
				>
					<ChevronRight className="h-4 w-4" />
				</button>
				{quickSpans && (
					<div className="ml-1 flex items-center gap-1">
						{quickSpans.spans.map((span) => (
							<button
								key={span.id}
								type="button"
								onClick={() => quickSpans.onApply(spanAnchor, span.id)}
								className={cn(
									"iz-pill !text-xs",
									quickSpans.isActive(spanAnchor, span.id)
										? "iz-pill-gold"
										: "iz-pill-ink",
								)}
							>
								{span.label}
							</button>
						))}
					</div>
				)}
			</div>
			{/* Month + year, so `Intl` rather than the dictionary: the two parts
			    reorder between languages ("August 2026" / "2026年8月") and there is
			    no key for the pair. date-fns `format` was used here and is locale-
			    blind unless a locale object is threaded through it, which is what
			    left this caption English above a translated grid. */}
			<p className="mt-0.5 text-xs font-semibold text-[var(--iz-txt)]">
				{month.toLocaleDateString(dateLocaleTag(locale), {
					month: "long",
					year: "numeric",
				})}
			</p>
		</div>
	);
}

function OutletCompactMultiCalendar({
	selected,
	month,
	onMonthChange,
	defaultMonth,
	startMonth,
	endMonth,
	onSelect,
	onDayDoubleClick,
	disabled,
	quickSpans,
	spanAnchor,
}: {
	selected: Date[];
	month?: Date;
	onMonthChange?: (month: Date) => void;
	defaultMonth?: Date;
	startMonth?: Date;
	endMonth?: Date;
	onSelect: (days: Date[] | undefined) => void;
	onDayDoubleClick?: (day: Date) => void;
	disabled?: (date: Date) => boolean;
	quickSpans?: MultiDateQuickSpanHandlers;
	spanAnchor: Date;
}) {
	const lastTapRef = useRef<{ iso: string; time: number } | null>(null);
	const viewMonth = month ?? defaultMonth ?? selected[0] ?? startOfToday();

	const MultiDayButton = useCallback(
		(props: React.ComponentProps<typeof CalendarDayButton>) => {
			const day = props.day.date;
			const dayIso = isoKeyFromDate(day);

			return (
				<CalendarDayButton
					{...props}
					onClick={(e) => {
						if (disabled?.(day)) {
							props.onClick?.(e);
							return;
						}

						const now = Date.now();
						const last = lastTapRef.current;
						if (
							last &&
							last.iso === dayIso &&
							now - last.time < DOUBLE_TAP_MS
						) {
							e.preventDefault();
							e.stopPropagation();
							lastTapRef.current = null;
							onDayDoubleClick?.(day);
							return;
						}

						lastTapRef.current = { iso: dayIso, time: now };
						props.onClick?.(e);
					}}
					onDoubleClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						if (disabled?.(day)) return;
						lastTapRef.current = null;
						onDayDoubleClick?.(day);
					}}
				/>
			);
		},
		[disabled, onDayDoubleClick],
	);

	return (
		<div>
			{onMonthChange && (
				<MultiCalendarHeader
					month={viewMonth}
					onMonthChange={onMonthChange}
					quickSpans={quickSpans}
					spanAnchor={spanAnchor}
				/>
			)}
			<Calendar
				mode="multiple"
				hideNavigation
				selected={selected}
				month={month}
				onMonthChange={onMonthChange}
				defaultMonth={defaultMonth ?? selected[0] ?? startOfToday()}
				startMonth={startMonth}
				endMonth={endMonth}
				disabled={disabled}
				onSelect={onSelect}
				components={{ DayButton: MultiDayButton }}
				className={compactCalClass}
				classNames={{
					...compactCalClassNames,
					month_caption: "hidden",
					nav: "hidden",
				}}
			/>
		</div>
	);
}

export function OutletMultiDatePopover({
	selectedIsos,
	onChange,
	disabled,
	formatLabel,
	compact,
	quickSpans,
}: {
	selectedIsos: string[];
	onChange: (isos: string[]) => void;
	disabled?: (date: Date) => boolean;
	formatLabel: (isos: string[]) => string;
	compact?: boolean;
	quickSpans?: MultiDateQuickSpanHandlers;
}) {
	const { t, locale } = usePortalLocale();
	const [open, setOpen] = useState(false);
	const sortedIsos = useMemo(() => [...selectedIsos].sort(), [selectedIsos]);
	const selectedDates = useMemo(
		() =>
			sortedIsos
				.map((iso) => dateFromIsoKey(iso))
				.filter((day): day is Date => Boolean(day)),
		[sortedIsos],
	);
	const [viewMonth, setViewMonth] = useState<Date>(
		() => selectedDates[0] ?? startOfToday(),
	);

	useEffect(() => {
		if (open) {
			setViewMonth(selectedDates[0] ?? startOfToday());
		}
	}, [open, selectedDates]);

	const spanAnchor = selectedDates[0] ?? viewMonth;
	const label = formatLabel(sortedIsos);
	const summary =
		sortedIsos.length > 0 && sortedIsos.length <= 4
			? sortedIsos
					.map((iso) => {
						const day = dateFromIsoKey(iso);
						return day
							? day.toLocaleDateString(dateLocaleTag(locale), {
									day: "numeric",
									month: "short",
								})
							: iso;
					})
					.join(", ")
			: "";

	const handleSelect = (days: Date[] | undefined) => {
		const next = (days ?? []).map((day) => isoKeyFromDate(day)).sort();
		onChange(next);
	};

	const handleDayDoubleClick = (day: Date) => {
		onChange([isoKeyFromDate(day)]);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						compact
							? "iz-chip flex items-center gap-1.5 py-1.5 pl-2.5 pr-2 text-sm font-semibold text-[var(--iz-txt)]"
							: cn(
									"iz-outlet-report-range-target iz-outlet-report-range-combined",
									open && "is-active",
								),
					)}
					aria-label={t.datePicker.chooseDates}
				>
					{compact ? (
						<>
							<CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold)]" />
							<span className="whitespace-nowrap">{label}</span>
							<ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)]" />
						</>
					) : (
						<>
							<span className="iz-outlet-report-range-target-label">
								{t.datePicker.dates}
							</span>
							<span className="iz-outlet-report-range-target-value">
								{label}
							</span>
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="iz-outlet-report-cal-popover w-auto border-[var(--iz-line)] bg-[var(--iz-panel)] p-2"
			>
				<MultiDateSelectionLegend selectedIsos={sortedIsos} summary={summary} />
				<p className="iz-tiny iz-muted2 mb-2 mt-2 px-0.5 leading-snug">
					{t.datePicker.tapToAddRemove}
				</p>
				<OutletCompactMultiCalendar
					selected={selectedDates}
					month={viewMonth}
					onMonthChange={setViewMonth}
					disabled={disabled}
					onSelect={handleSelect}
					onDayDoubleClick={handleDayDoubleClick}
					quickSpans={quickSpans}
					spanAnchor={spanAnchor}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function OutletDatePopoverField({
	label,
	value,
	displayLabel,
	onChange,
	disabled,
	startMonth,
	endMonth,
	range,
	align = "start",
	className,
}: {
	label: string;
	value: Date;
	displayLabel?: string;
	onChange: (date: Date) => void;
	disabled?: (date: Date) => boolean;
	startMonth?: Date;
	endMonth?: Date;
	range?: RangeHighlight;
	align?: "start" | "end" | "center";
	className?: string;
}) {
	const { t, locale } = usePortalLocale();
	const [open, setOpen] = useState(false);
	const shown = displayLabel ?? formatOutletDateLabel(value, locale);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"iz-outlet-report-range-target",
						open && "is-active",
						className,
					)}
					aria-label={fill(t.datePicker.chooseNamedDate, {
						label: label.toLowerCase(),
					})}
				>
					<span className="iz-outlet-report-range-target-label">{label}</span>
					<span className="iz-outlet-report-range-target-value">{shown}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align={align}
				sideOffset={6}
				className="iz-outlet-report-cal-popover w-auto border-[var(--iz-line)] bg-[var(--iz-panel)] p-2"
			>
				<OutletCompactCalendar
					selected={value}
					defaultMonth={value}
					startMonth={startMonth}
					endMonth={endMonth}
					disabled={disabled}
					range={range}
					onSelect={(day) => {
						if (disabled?.(day)) return;
						onChange(day);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function OutletDatePopoverChip({
	value,
	displayLabel,
	onChange,
	disabled,
}: {
	value: Date;
	displayLabel: string;
	onChange: (date: Date) => void;
	disabled?: (date: Date) => boolean;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="iz-chip flex items-center gap-1.5 py-1.5 pl-2.5 pr-2 text-sm font-semibold text-[var(--iz-txt)]"
				>
					<CalendarIcon className="h-3.5 w-3.5 text-[var(--iz-gold)]" />
					{displayLabel}
					<ChevronDown className="h-3.5 w-3.5 text-[var(--iz-muted)]" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="iz-outlet-report-cal-popover w-auto border-[var(--iz-line)] bg-[var(--iz-panel)] p-2"
			>
				<OutletCompactCalendar
					selected={value}
					defaultMonth={value}
					disabled={disabled}
					onSelect={(day) => {
						if (disabled?.(day)) return;
						onChange(day);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
