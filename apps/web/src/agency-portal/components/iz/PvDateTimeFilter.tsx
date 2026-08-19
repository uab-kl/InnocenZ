import {
	calendarNavBounds,
	HistDateCalendar,
} from "@agency-portal/components/iz/HistDateCalendar";
import { IzTimeInput } from "@agency-portal/components/iz/ui";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	dateFromIsoKey,
	isoKeyFromDate,
} from "@agency-portal/lib/pv-list-filters";
import { Calendar, ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function DatePickerField({
	value,
	onChange,
	compact,
	dateOptions = [],
	defaultMonth = new Date(),
}: {
	value: string;
	onChange: (v: string) => void;
	compact?: boolean;
	dateOptions?: { key: string; label: string }[];
	defaultMonth?: Date;
}) {
	const { t } = usePortalLocale();
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const selectedLabel = dateOptions.find((o) => o.key === value)?.label;
	const selected = dateFromIsoKey(value);
	const navBounds = useMemo(
		() => calendarNavBounds(dateOptions, defaultMonth),
		[dateOptions, defaultMonth],
	);
	const [viewMonth, setViewMonth] = useState(selected ?? defaultMonth);

	useEffect(() => {
		if (open) setViewMonth(selected ?? defaultMonth);
	}, [open, selected, defaultMonth]);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("click", onDoc);
		return () => document.removeEventListener("click", onDoc);
	}, [open]);

	return (
		<div
			ref={rootRef}
			className={
				compact
					? "iz-hist-date-picker-wrap iz-field !mb-0"
					: "iz-hist-date-picker-wrap iz-field"
			}
		>
			<label className={compact ? "!text-[10px]" : undefined}>Date</label>
			<button
				type="button"
				className={`iz-hist-picker iz-hist-picker-btn${compact ? " iz-hist-picker-sm" : ""}${open ? " open" : ""}`}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-label={t.history.chooseDate}
			>
				<Calendar className="h-4 w-4 shrink-0 text-[var(--iz-muted2)]" />
				<span className={`iz-hist-picker-label${value ? "" : " iz-muted2"}`}>
					{value
						? (selectedLabel ?? value)
						: compact
							? "Any date"
							: "Tap to choose a date"}
				</span>
				{value ? (
					<span
						role="button"
						tabIndex={0}
						className="iz-hist-clear"
						aria-label="Clear date"
						onClick={(e) => {
							e.stopPropagation();
							onChange("");
							setOpen(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								e.stopPropagation();
								onChange("");
								setOpen(false);
							}
						}}
					>
						<X className="h-3.5 w-3.5" />
					</span>
				) : (
					<ChevronDown
						className={`h-4 w-4 shrink-0 text-[var(--iz-muted2)] transition-transform${open ? " rotate-180" : ""}`}
					/>
				)}
			</button>
			{open && (
				<div className="iz-hist-cal iz-hist-cal--popover">
					<HistDateCalendar
						selected={selected}
						viewMonth={viewMonth}
						onViewMonthChange={setViewMonth}
						navBounds={navBounds}
						onSelectDay={(d) => {
							onChange(isoKeyFromDate(d));
							setOpen(false);
						}}
					/>
				</div>
			)}
		</div>
	);
}

export function PvDateTimeFilter({
	date,
	timeFrom,
	timeTo,
	onDateChange,
	onTimeFromChange,
	onTimeToChange,
	dateOptions,
	defaultMonth,
	compact,
	timeHint,
}: {
	date: string;
	timeFrom: string;
	timeTo: string;
	onDateChange: (v: string) => void;
	onTimeFromChange: (v: string) => void;
	onTimeToChange: (v: string) => void;
	dateOptions: { key: string; label: string }[];
	defaultMonth: Date;
	compact?: boolean;
	timeHint?: string;
}) {
	const clearDate = () => {
		onDateChange("");
		onTimeFromChange("");
		onTimeToChange("");
	};

	return (
		<div className={compact ? "space-y-2" : "space-y-3"}>
			<DatePickerField
				value={date}
				onChange={(next) => {
					if (!next) {
						clearDate();
						return;
					}
					onDateChange(next);
				}}
				compact={compact}
				dateOptions={dateOptions}
				defaultMonth={defaultMonth}
			/>
			<div className="iz-grid2">
				<div className="iz-field !mb-0">
					<label className={compact ? "!text-[10px]" : undefined}>
						From time
					</label>
					<IzTimeInput
						value={timeFrom}
						onChange={onTimeFromChange}
						disabled={!date}
						aria-label="From time"
					/>
				</div>
				<div className="iz-field !mb-0">
					<label className={compact ? "!text-[10px]" : undefined}>
						To time
					</label>
					<IzTimeInput
						value={timeTo}
						onChange={onTimeToChange}
						disabled={!date}
						aria-label="To time"
					/>
				</div>
			</div>
			{!date && (timeFrom || timeTo) ? (
				<p className="iz-tiny iz-muted2">
					Pick a date first to narrow by time within that shift day.
				</p>
			) : !date ? (
				<p className="iz-tiny iz-muted2">
					Select a date above — then tap From/To time to open the clock.
				</p>
			) : date && (timeFrom || timeTo) ? (
				<p className="iz-tiny iz-muted2">
					{timeHint ??
						`Matched by shift Time-In or receipt scan on ${dateOptions.find((o) => o.key === date)?.label ?? date}.`}
				</p>
			) : date ? (
				<p className="iz-tiny iz-muted2">
					Tap <b>From time</b> or <b>To time</b> to open the clock picker.
				</p>
			) : null}
		</div>
	);
}
