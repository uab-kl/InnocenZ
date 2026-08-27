import {
	EMPTY_PAYROLL_RANGE,
	type PayrollRangeFilter,
	payrollRangeActive,
} from "@agency-portal/lib/payroll-filters";
import { Calendar, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function PayrollRangeFilterCard({
	range,
	onChange,
	onClear,
	hint,
	clearLabel,
	clearActive = false,
	children,
}: {
	range: PayrollRangeFilter;
	onChange: (next: PayrollRangeFilter) => void;
	onClear: () => void;
	/** Already translated by the caller when passed — the default reads the dictionary. */
	hint?: string;
	clearLabel?: string;
	/** Show clear when non-range filters are also active */
	clearActive?: boolean;
	children?: ReactNode;
}) {
	const { t } = usePortalLocale();
	const showClear = payrollRangeActive(range) || clearActive;
	// Defaults resolve HERE, not in the parameter list: a default value is
	// evaluated before any hook has run, so it cannot read the locale.
	const hintText = hint ?? t.agencyPanels.rangeHint;
	const clearText = clearLabel ?? t.agencyPanels.clearRange;

	return (
		<div className="mt-3 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)]/60 p-2.5">
			<div className="flex items-center gap-2 iz-tiny iz-muted">
				<Calendar className="h-3.5 w-3.5 shrink-0" />
				{children ? t.payroll.filters : t.agencyPanels.dateTimeRange}
				{showClear && (
					<button
						type="button"
						className="ml-auto text-[var(--iz-gold-l)]"
						onClick={onClear}
					>
						{clearText}
					</button>
				)}
			</div>
			<div className="mt-2 grid grid-cols-2 gap-2">
				<label className="iz-tiny iz-muted2">
					{t.agencyPanels.fromDate}
					<input
						type="date"
						className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						value={range.fromDate}
						onChange={(e) => onChange({ ...range, fromDate: e.target.value })}
					/>
				</label>
				<label className="iz-tiny iz-muted2">
					{t.agencyPanels.toDate}
					<input
						type="date"
						className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						value={range.toDate}
						onChange={(e) => onChange({ ...range, toDate: e.target.value })}
					/>
				</label>
				<label className="iz-tiny iz-muted2">
					<Clock className="mr-1 inline h-3 w-3" />
					{t.agencyPanels.fromTime}
					<input
						type="time"
						className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						value={range.fromTime}
						onChange={(e) => onChange({ ...range, fromTime: e.target.value })}
					/>
				</label>
				<label className="iz-tiny iz-muted2">
					<Clock className="mr-1 inline h-3 w-3" />
					{t.agencyPanels.toTime}
					<input
						type="time"
						className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						value={range.toTime}
						onChange={(e) => onChange({ ...range, toTime: e.target.value })}
					/>
				</label>
			</div>
			{children ? (
				<div className="mt-2 grid grid-cols-1 gap-2 border-t border-[var(--iz-line)] pt-2 sm:grid-cols-3">
					{children}
				</div>
			) : null}
			<p className="iz-tiny iz-muted2 mt-2">{hintText}</p>
		</div>
	);
}

export { EMPTY_PAYROLL_RANGE };
