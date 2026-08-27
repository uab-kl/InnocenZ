import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { cn } from "@/lib/utils";

/**
 * A plain function cannot call the locale hook, so the dictionary arrives as an
 * argument. `emptyLabel` lost its default for the same reason a default
 * parameter cannot read `t`: it is evaluated before any hook has run. The
 * caller resolves it, or this falls back to the dictionary.
 *
 * The `dd MMM yyyy` patterns are date-fns FORMATS, not copy — they stay.
 */
export function formatSelectedDatesLabel(
	dates: Date[],
	t: PortalTranslations,
	emptyLabel?: string,
): string {
	if (dates.length === 0) return emptyLabel ?? t.adminBits.selectDates;
	const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
	if (sorted.length === 1) return format(sorted[0]!, "dd MMM yyyy");
	if (sorted.length === 2) {
		return `${format(sorted[0]!, "dd MMM")} · ${format(sorted[1]!, "dd MMM yyyy")}`;
	}
	return fill(t.adminBits.datesSelected, { n: sorted.length });
}

export function datesToQueryParam(dates: Date[]): string | undefined {
	if (dates.length === 0) return undefined;
	return [...dates]
		.map((date) => format(date, "yyyy-MM-dd"))
		.sort()
		.join(",");
}

interface DateMultiFilterProps {
	selectedDates: Date[];
	onChange: (dates: Date[]) => void;
	/** Already translated by the caller — it lands inside "Clear {label}". */
	ariaLabel: string;
	emptyLabel?: string;
	buttonClassName?: string;
}

/** Multi-day calendar filter — same pattern as the History page. */
export function DateMultiFilter({
	selectedDates,
	onChange,
	ariaLabel,
	emptyLabel,
	buttonClassName,
}: DateMultiFilterProps) {
	const { t } = usePortalLocale();
	return (
		<div className="flex items-center gap-1.5">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						className={cn(
							"justify-start font-normal sm:min-w-48",
							buttonClassName,
						)}
						aria-label={ariaLabel}
					>
						<CalendarIcon className="text-muted-foreground" />
						<span className="truncate">
							{formatSelectedDatesLabel(selectedDates, t, emptyLabel)}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="end">
					<Calendar
						mode="multiple"
						selected={selectedDates}
						onSelect={(dates) => onChange(dates ?? [])}
						numberOfMonths={1}
					/>
					{selectedDates.length > 0 && (
						<div className="border-t border-border p-2">
							<Button
								variant="ghost"
								size="sm"
								className="w-full"
								onClick={() => onChange([])}
							>
								{t.adminBits.clearDates}
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
			{selectedDates.length > 0 && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={fill(t.adminBits.clearNamed, { label: ariaLabel })}
					onClick={() => onChange([])}
				>
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}

interface DateSingleFilterProps {
	value: Date | undefined;
	onChange: (value: Date | undefined) => void;
	/** Already translated by the caller — it lands inside "Clear {label}". */
	ariaLabel: string;
	emptyLabel?: string;
	buttonClassName?: string;
}

/** Single-day picker for form fields (e.g. scheduled date). */
export function DateSingleFilter({
	value,
	onChange,
	ariaLabel,
	emptyLabel,
	buttonClassName,
}: DateSingleFilterProps) {
	const { t } = usePortalLocale();
	const emptyText = emptyLabel ?? t.adminService.selectDate;
	return (
		<div className="flex items-center gap-1.5">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className={cn("w-full justify-start font-normal", buttonClassName)}
						aria-label={ariaLabel}
					>
						<CalendarIcon className="text-muted-foreground" />
						<span className="truncate">
							{value ? format(value, "dd MMM yyyy") : emptyText}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={value}
						onSelect={(date) => onChange(date)}
						numberOfMonths={1}
					/>
					{value && (
						<div className="border-t border-border p-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="w-full"
								onClick={() => onChange(undefined)}
							>
								{t.adminBits.clearDate}
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
			{value && (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={fill(t.adminBits.clearNamed, { label: ariaLabel })}
					onClick={() => onChange(undefined)}
				>
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
