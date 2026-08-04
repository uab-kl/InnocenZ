import {
	CalendarDayButton,
	Calendar as CalendarUi,
} from "@agency-portal/components/ui/calendar";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { type ComponentProps, useMemo } from "react";

const MONTH_LABELS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

export function dateFromIsoKey(key: string): Date | undefined {
	if (!key) return undefined;
	const [y, m, d] = key.split("-").map(Number);
	if (!y || !m || !d) return undefined;
	return new Date(y, m - 1, d);
}

export function localTodayDate(iso = getLiveTodayIso()) {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function isoKeyFromDate(date: Date) {
	return format(date, "yyyy-MM-dd");
}

/** Range filters may include days without rows — only block future dates. */
export function isDateSelectableForFilter(
	date: Date,
	todayIso = getLiveTodayIso(),
) {
	return isoKeyFromDate(date) <= todayIso;
}

export function historyDateBounds(dateOptions: { key: string }[]) {
	if (dateOptions.length === 0) return { minKey: "", maxKey: "" };
	const keys = dateOptions.map((o) => o.key).sort();
	return { minKey: keys[0]!, maxKey: keys[keys.length - 1]! };
}

export function calendarNavBounds(
	dateOptions: { key: string }[],
	defaultMonth: Date,
) {
	if (dateOptions.length === 0) {
		const y = defaultMonth.getFullYear();
		return {
			startMonth: new Date(y - 3, 0, 1),
			endMonth: new Date(y + 1, 11, 1),
		};
	}
	const years = dateOptions
		.map((o) => dateFromIsoKey(o.key)?.getFullYear())
		.filter((y): y is number => typeof y === "number");
	const todayYear = parseISO(getLiveTodayIso()).getFullYear();
	const minY = Math.min(...years, todayYear);
	const maxY = Math.max(...years, todayYear, defaultMonth.getFullYear());
	return { startMonth: new Date(minY, 0, 1), endMonth: new Date(maxY, 11, 1) };
}

function HistCalendarMonthNav({
	viewMonth,
	onMonthChange,
	startMonth,
	endMonth,
}: {
	viewMonth: Date;
	onMonthChange: (d: Date) => void;
	startMonth: Date;
	endMonth: Date;
}) {
	const minY = startMonth.getFullYear();
	const maxY = endMonth.getFullYear();
	const years = useMemo(
		() => Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i),
		[minY, maxY],
	);
	const month = viewMonth.getMonth();
	const year = viewMonth.getFullYear();

	return (
		<div className="iz-hist-cal-nav">
			<label className="iz-hist-cal-nav-field">
				<span className="iz-hist-cal-nav-label">Month</span>
				<span className="iz-hist-cal-select-wrap">
					<select
						className="iz-hist-cal-select"
						value={month}
						aria-label="Choose month"
						onChange={(e) =>
							onMonthChange(new Date(year, Number(e.target.value), 1))
						}
					>
						{MONTH_LABELS.map((label, i) => (
							<option key={label} value={i}>
								{label}
							</option>
						))}
					</select>
					<ChevronDown className="iz-hist-cal-select-icon" aria-hidden />
				</span>
			</label>
			<label className="iz-hist-cal-nav-field">
				<span className="iz-hist-cal-nav-label">Year</span>
				<span className="iz-hist-cal-select-wrap">
					<select
						className="iz-hist-cal-select"
						value={year}
						aria-label="Choose year"
						onChange={(e) =>
							onMonthChange(new Date(Number(e.target.value), month, 1))
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
	);
}

export function HistDateCalendar({
	selected,
	viewMonth,
	onViewMonthChange,
	navBounds,
	onSelectDay,
	className,
}: {
	selected?: Date;
	viewMonth: Date;
	onViewMonthChange: (d: Date) => void;
	navBounds: { startMonth: Date; endMonth: Date };
	onSelectDay: (date: Date) => void;
	className?: string;
}) {
	const viewYear = viewMonth.getFullYear();
	const viewMonthIndex = viewMonth.getMonth();

	const isInViewMonth = (date: Date) =>
		date.getFullYear() === viewYear && date.getMonth() === viewMonthIndex;

	const DayButton = useMemo(() => {
		function HistDayButton(props: ComponentProps<typeof CalendarDayButton>) {
			return (
				<CalendarDayButton
					{...props}
					onClick={(e) => {
						props.onClick?.(e);
						if (props.modifiers.disabled || props.modifiers.outside) return;
						if (!isInViewMonth(props.day.date)) return;
						if (!isDateSelectableForFilter(props.day.date)) return;
						onSelectDay(props.day.date);
					}}
				/>
			);
		}
		return HistDayButton;
	}, [onSelectDay, viewYear, viewMonthIndex]);

	return (
		<>
			<HistCalendarMonthNav
				viewMonth={viewMonth}
				onMonthChange={onViewMonthChange}
				startMonth={navBounds.startMonth}
				endMonth={navBounds.endMonth}
			/>
			<CalendarUi
				mode="single"
				hideNavigation
				month={viewMonth}
				onMonthChange={onViewMonthChange}
				startMonth={navBounds.startMonth}
				endMonth={navBounds.endMonth}
				selected={selected}
				disabled={(date) =>
					!isInViewMonth(date) || !isDateSelectableForFilter(date)
				}
				components={{ DayButton }}
				classNames={{
					month_caption: "hidden",
					nav: "hidden",
				}}
				className={
					className ??
					"iz-hist-cal-picker w-full rounded-[14px] border-0 bg-transparent p-0 text-[var(--iz-txt)]"
				}
			/>
		</>
	);
}
