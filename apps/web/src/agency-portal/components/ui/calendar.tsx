"use client";

import { Button, buttonVariants } from "@agency-portal/components/ui/button";
import { cn } from "@agency-portal/lib/utils";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import * as React from "react";
import {
	type DayButton,
	DayPicker,
	getDefaultClassNames,
} from "react-day-picker";
import { enGB, zhCN } from "react-day-picker/locale";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/**
 * The date-fns locale object behind the calendar's own rendering.
 *
 * The month caption and the weekday header are NOT ours — they come from
 * react-day-picker's inherited `formatCaption` / `formatWeekdayName`, which
 * format through this object. With no `locale` prop the library falls back to
 * `enUS`, so a 中文 portal still printed "August" and "Th". Passing the object is
 * the whole fix; there is nothing to override formatter-by-formatter.
 *
 * These come from `react-day-picker/locale`, not `date-fns/locale`: same
 * formatting, plus the library's translated ARIA labels (「选择月份」,
 * 「前往下个月」…), which a bare date-fns locale leaves in English.
 *
 * English resolves to `enGB` rather than `enUS` for the reason `dateLocaleTag`
 * gives — day-before-month ordering is the portal's convention — and the shape
 * mirrors that helper so an unrecognised locale falls back to English the same
 * way.
 */
function dayPickerLocale(locale: string) {
	return locale === "zh" ? zhCN : enGB;
}

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	captionLayout = "label",
	buttonVariant = "ghost",
	formatters,
	components,
	locale,
	...props
}: React.ComponentProps<typeof DayPicker> & {
	buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
	const defaultClassNames = getDefaultClassNames();
	const { locale: portalLocale } = usePortalLocale();

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			// `locale` is pulled out of `...props` only so an explicit
			// `locale={undefined}` from a caller still lands on the portal's choice
			// instead of dropping the calendar back to the library's `enUS`. Any real
			// value a caller passes still wins.
			locale={locale ?? dayPickerLocale(portalLocale)}
			// Pinned because the locale object carries a week start with it, and both
			// `enGB` and `zhCN` start on MONDAY while the library's old `enUS` default
			// started on Sunday. Without this line, localizing the labels would have
			// silently rotated every calendar grid by a day — and the portal's weeks
			// are Sun–Sat everywhere else (payroll, vouchers, `weekdayShortLabel`).
			// Still `...props`-overridable below for a caller that wants otherwise.
			weekStartsOn={0}
			className={cn(
				"bg-background group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
				String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
				String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
				className,
			)}
			captionLayout={captionLayout}
			// A `formatMonthDropdown` override used to sit here, forcing the SHORT
			// month through `toLocaleString("default")`. It was dead: that formatter
			// only fires under a dropdown caption, `captionLayout` defaults to "label",
			// and no caller in the app passes anything else. Deleted rather than
			// translated — with a real `locale` above, the library's own default
			// already prints the localized month name, so re-adding an override would
			// only re-pin the browser's language over the portal's.
			formatters={formatters}
			classNames={{
				root: cn("w-fit", defaultClassNames.root),
				months: cn(
					"relative flex flex-col gap-4 md:flex-row",
					defaultClassNames.months,
				),
				month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
				nav: cn(
					"absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
					defaultClassNames.nav,
				),
				button_previous: cn(
					buttonVariants({ variant: buttonVariant }),
					"h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50",
					defaultClassNames.button_previous,
				),
				button_next: cn(
					buttonVariants({ variant: buttonVariant }),
					"h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50",
					defaultClassNames.button_next,
				),
				month_caption: cn(
					"flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
					defaultClassNames.month_caption,
				),
				dropdowns: cn(
					"flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
					defaultClassNames.dropdowns,
				),
				dropdown_root: cn(
					"has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border",
					defaultClassNames.dropdown_root,
				),
				dropdown: cn(
					"bg-popover absolute inset-0 opacity-0",
					defaultClassNames.dropdown,
				),
				caption_label: cn(
					"select-none font-medium",
					captionLayout === "label"
						? "text-sm"
						: "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
					defaultClassNames.caption_label,
				),
				month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
				weekdays: cn("flex", defaultClassNames.weekdays),
				weekday: cn(
					"text-muted-foreground flex-1 select-none rounded-md text-[0.8rem] font-normal",
					defaultClassNames.weekday,
				),
				week: cn("mt-2 flex w-full", defaultClassNames.week),
				week_number_header: cn(
					"w-(--cell-size) select-none",
					defaultClassNames.week_number_header,
				),
				week_number: cn(
					"text-muted-foreground select-none text-[0.8rem]",
					defaultClassNames.week_number,
				),
				day: cn(
					"group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
					defaultClassNames.day,
				),
				range_start: cn(
					"bg-accent rounded-l-md",
					defaultClassNames.range_start,
				),
				range_middle: cn("rounded-none", defaultClassNames.range_middle),
				range_end: cn("bg-accent rounded-r-md", defaultClassNames.range_end),
				today: cn(
					"bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
					defaultClassNames.today,
				),
				outside: cn(
					"text-muted-foreground aria-selected:text-muted-foreground",
					defaultClassNames.outside,
				),
				disabled: cn(
					"text-muted-foreground opacity-50",
					defaultClassNames.disabled,
				),
				hidden: cn("invisible", defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				Root: ({ className, rootRef, ...props }) => {
					return (
						<div
							data-slot="calendar"
							ref={rootRef}
							className={cn(className)}
							{...props}
						/>
					);
				},
				Chevron: ({ className, orientation, ...props }) => {
					if (orientation === "left") {
						return (
							<ChevronLeftIcon className={cn("size-4", className)} {...props} />
						);
					}

					if (orientation === "right") {
						return (
							<ChevronRightIcon
								className={cn("size-4", className)}
								{...props}
							/>
						);
					}

					return (
						<ChevronDownIcon className={cn("size-4", className)} {...props} />
					);
				},
				DayButton: CalendarDayButton,
				WeekNumber: ({ children, ...props }) => {
					return (
						<td {...props}>
							<div className="flex size-(--cell-size) items-center justify-center text-center">
								{children}
							</div>
						</td>
					);
				},
				...components,
			}}
			{...props}
		/>
	);
}

function CalendarDayButton({
	className,
	day,
	modifiers,
	...props
}: React.ComponentProps<typeof DayButton>) {
	const defaultClassNames = getDefaultClassNames();

	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	return (
		<Button
			ref={ref}
			variant="ghost"
			size="icon"
			// An attribute, not copy — nothing renders it and nothing reads it. Left
			// on the browser's locale deliberately: routing it through the portal
			// dictionary would make a DOM attribute's VALUE change with the language,
			// which is how a selector or snapshot starts failing in one language only.
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
				"data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 flex aspect-square h-auto w-full min-w-(--cell-size) flex-col gap-1 font-normal leading-none data-[range-end=true]:rounded-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] [&>span]:text-xs [&>span]:opacity-70",
				defaultClassNames.day,
				className,
			)}
			{...props}
		/>
	);
}

export { Calendar, CalendarDayButton };
