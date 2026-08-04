import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function formatSelectedDatesLabel(
	dates: Date[],
	emptyLabel = "Select date(s)",
): string {
	if (dates.length === 0) return emptyLabel;
	const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
	if (sorted.length === 1) return format(sorted[0]!, "dd MMM yyyy");
	if (sorted.length === 2) {
		return `${format(sorted[0]!, "dd MMM")} · ${format(sorted[1]!, "dd MMM yyyy")}`;
	}
	return `${sorted.length} dates selected`;
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
	ariaLabel: string;
	emptyLabel?: string;
	buttonClassName?: string;
}

/** Multi-day calendar filter — same pattern as the History page. */
export function DateMultiFilter({
	selectedDates,
	onChange,
	ariaLabel,
	emptyLabel = "Select date(s)",
	buttonClassName,
}: DateMultiFilterProps) {
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
							{formatSelectedDatesLabel(selectedDates, emptyLabel)}
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
								Clear dates
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
			{selectedDates.length > 0 && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Clear ${ariaLabel}`}
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
	ariaLabel: string;
	emptyLabel?: string;
	buttonClassName?: string;
}

/** Single-day picker for form fields (e.g. scheduled date). */
export function DateSingleFilter({
	value,
	onChange,
	ariaLabel,
	emptyLabel = "Select date",
	buttonClassName,
}: DateSingleFilterProps) {
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
							{value ? format(value, "dd MMM yyyy") : emptyLabel}
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
								Clear date
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
					aria-label={`Clear ${ariaLabel}`}
					onClick={() => onChange(undefined)}
				>
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
