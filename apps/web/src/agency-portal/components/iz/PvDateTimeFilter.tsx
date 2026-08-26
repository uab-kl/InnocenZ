import {
	calendarNavBounds,
	HistDateCalendar,
} from "@agency-portal/components/iz/HistDateCalendar";
import { IzTimeInput } from "@agency-portal/components/iz/ui";
import {
	dateFromIsoKey,
	isoKeyFromDate,
} from "@agency-portal/lib/pv-list-filters";
import { Calendar, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const dateButtonId = useId();
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
			<label
				htmlFor={dateButtonId}
				className={compact ? "!text-[10px]" : undefined}
			>
				{t.filters.date}
			</label>
			<button
				id={dateButtonId}
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
							? t.izPv.anyDate
							: t.izPv.tapToChooseDate}
				</span>
				{value ? (
					// biome-ignore lint/a11y/useSemanticElements: this clear control lives INSIDE the trigger <button>, and `.iz-hist-clear` is one of its flex children — a real <button> here would nest a button in a button, which the HTML parser splits apart on SSR and would break the trigger's layout.
					<span
						role="button"
						tabIndex={0}
						className="iz-hist-clear"
						aria-label={t.history.clearDate}
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
	const { t } = usePortalLocale();
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
					{/* biome-ignore lint/a11y/noLabelWithoutControl: caption only — IzTimeInput renders its own <button> and already carries the matching aria-label, and it exposes no `id`, so an htmlFor here would dangle. It stays a <label> because `.iz-field label` in prototype-theme.css is an ELEMENT selector: a <span> would silently drop the uppercase 10.5px Sora typography. */}
					<label className={compact ? "!text-[10px]" : undefined}>
						{t.izPv.fromTime}
					</label>
					<IzTimeInput
						value={timeFrom}
						onChange={onTimeFromChange}
						disabled={!date}
						aria-label={t.izPv.fromTime}
					/>
				</div>
				<div className="iz-field !mb-0">
					{/* biome-ignore lint/a11y/noLabelWithoutControl: caption only — IzTimeInput renders its own <button> and already carries the matching aria-label, and it exposes no `id`, so an htmlFor here would dangle. It stays a <label> because `.iz-field label` in prototype-theme.css is an ELEMENT selector: a <span> would silently drop the uppercase 10.5px Sora typography. */}
					<label className={compact ? "!text-[10px]" : undefined}>
						{t.izPv.toTime}
					</label>
					<IzTimeInput
						value={timeTo}
						onChange={onTimeToChange}
						disabled={!date}
						aria-label={t.izPv.toTime}
					/>
				</div>
			</div>
			{!date && (timeFrom || timeTo) ? (
				<p className="iz-tiny iz-muted2">{t.izPv.pickDateFirstHint}</p>
			) : !date ? (
				<p className="iz-tiny iz-muted2">{t.izPv.selectDateAboveHint}</p>
			) : date && (timeFrom || timeTo) ? (
				<p className="iz-tiny iz-muted2">
					{/* `timeHint` is supplied by the caller and arrives already
					    translated — it lands here whole, never mid-sentence. */}
					{timeHint ??
						fill(t.izPv.matchedByTimeInOrReceipt, {
							date: dateOptions.find((o) => o.key === date)?.label ?? date,
						})}
				</p>
			) : date ? (
				<p className="iz-tiny iz-muted2">{t.izPv.tapFromOrToTimeHint}</p>
			) : null}
		</div>
	);
}
