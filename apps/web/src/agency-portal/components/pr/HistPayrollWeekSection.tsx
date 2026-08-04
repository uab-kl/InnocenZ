import { IzPill } from "@agency-portal/components/iz/ui";
import { cn } from "@agency-portal/lib/utils";
import { CalendarRange, ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

export function HistPayrollWeekSection({
	title,
	hint,
	shiftCount,
	isCurrent = false,
	defaultOpen = false,
	children,
}: {
	title: string;
	hint: string;
	shiftCount: number;
	isCurrent?: boolean;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<section
			className={cn(
				"iz-hist-payroll-week",
				isCurrent && "is-current",
				open && "is-open",
			)}
		>
			<button
				type="button"
				className="iz-hist-payroll-week__trigger"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<span className="iz-hist-payroll-week__icon" aria-hidden>
					<CalendarRange className="h-4 w-4" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="iz-hist-payroll-week__title-row">
						<span className="iz-hist-payroll-week__title">{title}</span>
						{isCurrent && (
							<IzPill variant="gold" className="!py-0 !text-[8px]">
								Current
							</IzPill>
						)}
						<IzPill variant="ink" className="!py-0 !text-[8px]">
							{shiftCount} shift{shiftCount === 1 ? "" : "s"}
						</IzPill>
					</span>
					<span className="iz-hist-payroll-week__hint">{hint}</span>
				</span>
				<span className="iz-hist-payroll-week__chev" aria-hidden>
					<ChevronDown
						className={cn(
							"h-4 w-4 transition-transform duration-200",
							open && "rotate-180",
						)}
					/>
				</span>
			</button>
			{open && <div className="iz-hist-payroll-week__body">{children}</div>}
		</section>
	);
}
