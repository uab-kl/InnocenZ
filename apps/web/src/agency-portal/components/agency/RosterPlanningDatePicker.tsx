import { Calendar as CalendarUi } from "@agency-portal/components/ui/calendar";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import {
	mondayOfWeek,
	parseLocalIso,
	weekRangeLabel,
} from "@agency-portal/lib/roster-week-plan";
import { cn } from "@agency-portal/lib/utils";
import { addDays } from "date-fns";
import { Calendar, ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function dateFromIso(iso: string): Date | undefined {
	if (!iso) return undefined;
	return parseLocalIso(iso);
}

function isoFromDate(date: Date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function isInPlanningWeek(date: Date, anchorIso: string): boolean {
	if (!anchorIso) return false;
	const weekStart = parseLocalIso(mondayOfWeek(anchorIso));
	const weekEnd = addDays(weekStart, 6);
	const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return day >= weekStart && day <= weekEnd;
}

export function RosterPlanningDatePicker({
	value,
	onChange,
	rosterDates = [],
	placeholder = "Pick week",
	allowClear = false,
	hint = "Dots mark days with roster shifts.",
	weekly = false,
	className,
}: {
	value: string;
	onChange: (iso: string) => void;
	rosterDates?: string[];
	placeholder?: string;
	allowClear?: boolean;
	hint?: string;
	/** When true, clicking any day selects Mon–Sun and highlights the full week. */
	weekly?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const selected = dateFromIso(value);
	const rosterDateSet = new Set(rosterDates);
	const label = value
		? weekly
			? weekRangeLabel(mondayOfWeek(value))
			: fmtDateLabelFromIso(value)
		: placeholder;

	const weekModifiers = useMemo(
		() => ({
			hasShifts: (date: Date) => rosterDateSet.has(isoFromDate(date)),
			...(weekly && value
				? { inWeek: (date: Date) => isInPlanningWeek(date, value) }
				: {}),
		}),
		[rosterDateSet, value, weekly],
	);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, [open]);

	return (
		<div ref={rootRef} className={cn("iz-roster-planning-date", className)}>
			<button
				type="button"
				className={`iz-roster-planning-date-trigger${open ? " open" : ""}`}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-label={weekly ? "Choose week" : "Choose date"}
			>
				<span
					className={`flex min-w-0 items-center gap-1.5 truncate${value ? "" : " text-[var(--iz-muted2)]"}`}
				>
					<Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
					<span className="truncate">{label}</span>
				</span>
				{allowClear && value ? (
					<span
						role="button"
						tabIndex={0}
						className="iz-hist-clear"
						aria-label="Clear week"
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
				<div
					className={cn(
						"iz-hist-cal iz-hist-cal--popover iz-roster-planning-date-popover",
						weekly && "iz-roster-planning-week-cal",
					)}
				>
					<CalendarUi
						mode="single"
						weekStartsOn={weekly ? 1 : 0}
						showOutsideDays
						selected={selected}
						defaultMonth={
							selected ?? dateFromIso(rosterDates[0] ?? value) ?? new Date()
						}
						onSelect={(d) => {
							if (d) onChange(isoFromDate(d));
							setOpen(false);
						}}
						modifiers={weekModifiers}
						modifiersClassNames={{
							hasShifts: "iz-roster-cal-has-shifts",
							...(weekly ? { inWeek: "iz-roster-cal-in-week" } : {}),
						}}
						className={cn(
							"rounded-[14px] border-0 bg-transparent p-0 text-[var(--iz-txt)]",
							weekly && "iz-roster-planning-week-cal-picker",
						)}
					/>
					{hint ? <p className="iz-tiny iz-muted2 mt-1 px-1">{hint}</p> : null}
				</div>
			)}
		</div>
	);
}
