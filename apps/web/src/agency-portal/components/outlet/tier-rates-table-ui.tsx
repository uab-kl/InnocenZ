import { snapTierWage } from "@agency-portal/lib/agency-demo";
import { cn } from "@agency-portal/lib/utils";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

/** Display tier table money — comma thousands from 1,000 upward. */
export function formatTierTableNumber(n: number): string {
	return n >= 1000 ? n.toLocaleString("en-MY") : String(n);
}

export function TierMoneyInput({
	value,
	onChange,
	placeholder,
	disabled,
}: {
	value: number | undefined;
	onChange: (n: number | undefined) => void;
	placeholder?: string;
	disabled?: boolean;
}) {
	const [text, setText] = useState(
		value != null && value > 0 ? formatTierTableNumber(value) : "",
	);

	useEffect(() => {
		setText(value != null && value > 0 ? formatTierTableNumber(value) : "");
	}, [value]);

	const commit = () => {
		if (disabled) return;
		const trimmed = text.trim();
		if (trimmed === "") {
			onChange(undefined);
			return;
		}
		const n = parseFloat(trimmed.replace(/,/g, ""));
		if (!Number.isNaN(n) && n >= 0) {
			const rounded = Math.round(n);
			onChange(rounded);
			setText(formatTierTableNumber(rounded));
		} else {
			setText("");
			onChange(undefined);
		}
	};

	return (
		<input
			type="text"
			inputMode="decimal"
			value={text}
			placeholder={placeholder}
			disabled={disabled}
			onChange={(e) =>
				!disabled && setText(e.target.value.replace(/[^\d.]/g, ""))
			}
			onBlur={commit}
			className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-[var(--iz-muted)] disabled:cursor-not-allowed disabled:opacity-50 cursor-text"
		/>
	);
}

export function TierPayInput({
	value,
	onChange,
	disabled,
}: {
	value: number;
	onChange: (n: number) => void;
	disabled?: boolean;
}) {
	const [text, setText] = useState(formatTierTableNumber(value));

	useEffect(() => {
		setText(formatTierTableNumber(value));
	}, [value]);

	const commit = () => {
		if (disabled) return;
		const n = parseFloat(text.replace(/,/g, ""));
		if (!Number.isNaN(n) && n >= 0) {
			const snapped = snapTierWage(n);
			setText(formatTierTableNumber(snapped));
			onChange(snapped);
		} else {
			setText(formatTierTableNumber(value));
		}
	};

	return (
		<input
			type="text"
			inputMode="decimal"
			value={text}
			disabled={disabled}
			onChange={(e) =>
				!disabled && setText(e.target.value.replace(/[^\d.]/g, ""))
			}
			onBlur={commit}
			className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-text"
		/>
	);
}

export function TierPctInput({
	value,
	onChange,
	disabled,
}: {
	value: number;
	onChange: (n: number) => void;
	disabled?: boolean;
}) {
	const [text, setText] = useState(String(value));

	useEffect(() => {
		setText(String(value));
	}, [value]);

	const commit = () => {
		if (disabled) return;
		const n = parseFloat(text.replace(/,/g, ""));
		if (!Number.isNaN(n) && n >= 0) {
			const clamped = Math.min(100, Math.round(n));
			setText(String(clamped));
			onChange(clamped);
		} else {
			setText(String(value));
		}
	};

	return (
		<input
			type="text"
			inputMode="decimal"
			value={text}
			disabled={disabled}
			onChange={(e) =>
				!disabled && setText(e.target.value.replace(/[^\d.]/g, ""))
			}
			onBlur={commit}
			className="w-9 min-w-0 bg-transparent text-center text-xs font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-text"
		/>
	);
}

export function TierCountInput({
	value,
	onChange,
	disabled,
	max,
}: {
	value: number;
	onChange: (n: number) => void;
	disabled?: boolean;
	max?: number;
}) {
	const [text, setText] = useState(String(value));

	useEffect(() => {
		setText(String(value));
	}, [value]);

	const applyCount = (raw: string, commitEmpty = false) => {
		if (disabled) return;
		const trimmed = raw.replace(/\D/g, "");
		if (trimmed === "") {
			if (commitEmpty) {
				setText(String(value));
			} else {
				setText("");
			}
			return;
		}
		const n = parseInt(trimmed, 10);
		if (Number.isNaN(n) || n < 0) {
			setText(String(value));
			return;
		}
		const capped = max !== undefined ? Math.min(max, n) : n;
		setText(String(capped));
		if (capped !== value) onChange(capped);
	};

	return (
		<input
			type="text"
			inputMode="numeric"
			value={text}
			disabled={disabled}
			onChange={(e) => applyCount(e.target.value)}
			onBlur={() => applyCount(text, true)}
			className="min-w-0 flex-1 bg-transparent text-center text-sm font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-text"
		/>
	);
}

function TierTableStepperBtn({
	kind,
	onClick,
	disabled,
	label,
}: {
	kind: "dec" | "inc";
	onClick: () => void;
	disabled?: boolean;
	label: string;
}) {
	const Icon = kind === "dec" ? Minus : Plus;
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="iz-tier-table-stepper__btn"
			aria-label={label}
		>
			<Icon className="h-3 w-3" />
		</button>
	);
}

export function TierPctStepper({
	value,
	onChange,
	disabled,
	step = 1,
	min = 0,
	max = 100,
}: {
	value: number;
	onChange: (n: number) => void;
	disabled?: boolean;
	step?: number;
	min?: number;
	max?: number;
}) {
	const dec = () => onChange(Math.max(min, value - step));
	const inc = () => onChange(Math.min(max, value + step));

	return (
		<div className="iz-tier-table-stepper">
			<TierTableStepperBtn
				kind="dec"
				onClick={dec}
				disabled={disabled || value <= min}
				label="Decrease"
			/>
			<TierPctInput value={value} onChange={onChange} disabled={disabled} />
			<span className="text-[9px] font-semibold text-[var(--iz-muted)]">%</span>
			<TierTableStepperBtn
				kind="inc"
				onClick={inc}
				disabled={disabled || value >= max}
				label="Increase"
			/>
		</div>
	);
}

export function TierCountStepper({
	value,
	onChange,
	disabled,
	max,
	min = 0,
}: {
	value: number;
	onChange: (n: number) => void;
	disabled?: boolean;
	max?: number;
	min?: number;
}) {
	const dec = () => onChange(Math.max(min, value - 1));
	const inc = () =>
		onChange(max !== undefined ? Math.min(max, value + 1) : value + 1);

	return (
		<div className="iz-tier-table-stepper iz-tier-table-stepper--count">
			<TierTableStepperBtn
				kind="dec"
				onClick={dec}
				disabled={disabled || value <= min}
				label="Decrease"
			/>
			<TierCountInput
				value={value}
				onChange={onChange}
				disabled={disabled}
				max={max}
			/>
			<TierTableStepperBtn
				kind="inc"
				onClick={inc}
				disabled={disabled || (max !== undefined && value >= max)}
				label="Increase"
			/>
		</div>
	);
}

export function TierHoursInput({
	value,
	onChange,
	disabled,
	compact,
}: {
	value: number;
	onChange: (n: number) => void;
	disabled?: boolean;
	/** Fixed width for centered table cells (OT after column). */
	compact?: boolean;
}) {
	const [text, setText] = useState(String(value));

	useEffect(() => {
		setText(String(value));
	}, [value]);

	const commit = () => {
		if (disabled) return;
		const n = parseFloat(text.replace(/,/g, ""));
		if (!Number.isNaN(n) && n >= 0) {
			const rounded = Math.round(n);
			setText(String(rounded));
			onChange(rounded);
		} else {
			setText(String(value));
		}
	};

	return (
		<input
			type="text"
			inputMode="decimal"
			value={text}
			disabled={disabled}
			onChange={(e) =>
				!disabled && setText(e.target.value.replace(/[^\d.]/g, ""))
			}
			onBlur={commit}
			className={cn(
				"min-w-0 bg-transparent text-center text-sm font-semibold tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-text",
				compact ? "w-8" : "flex-1",
			)}
		/>
	);
}

export function fieldShell(className?: string, flat?: boolean) {
	return cn(
		flat
			? "flex items-center gap-1"
			: "flex items-center gap-1 rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5",
		className,
	);
}

export const TIER_TABLE_GRID_BASE = "grid items-stretch";
export const TIER_TABLE_GRID_COLS =
	"grid-cols-[minmax(7.5rem,1.15fr)_minmax(5.5rem,0.9fr)_minmax(5.5rem,0.9fr)_minmax(7.5rem,1.1fr)_minmax(4.5rem,0.7fr)]";
export const TIER_TABLE_GRID_COLS_WORKSPACE =
	"grid-cols-[minmax(5.5rem,0.85fr)_minmax(5rem,0.8fr)_minmax(3.75rem,0.55fr)_minmax(5rem,0.8fr)_minmax(4.25rem,0.65fr)_minmax(4.25rem,0.65fr)_minmax(3.25rem,0.5fr)_minmax(3.75rem,0.55fr)]";
export const TIER_TABLE_GRID_COLS_WORKSPACE_RATES_ONLY =
	"grid-cols-[minmax(5.5rem,0.85fr)_minmax(5rem,0.8fr)_minmax(3.75rem,0.55fr)_minmax(4.25rem,0.65fr)_minmax(4.25rem,0.65fr)_minmax(3.25rem,0.5fr)_minmax(3.75rem,0.55fr)]";
export const TIER_TABLE_GRID_COLS_RATES_ONLY =
	"grid-cols-[minmax(7.5rem,1.15fr)_minmax(5.5rem,0.9fr)_minmax(7.5rem,1.1fr)_minmax(4.5rem,0.7fr)]";
export const TIER_TABLE_GRID_COLS_WITH_STAFFING =
	"grid-cols-[minmax(7.5rem,1.15fr)_minmax(5.5rem,0.9fr)_minmax(5.5rem,0.9fr)_minmax(7.5rem,1.1fr)_minmax(3.25rem,0.55fr)_minmax(3.25rem,0.55fr)]";
export const TIER_TABLE_GRID_COLS_WITH_STAFFING_RATES_ONLY =
	"grid-cols-[minmax(7.5rem,1.15fr)_minmax(5.5rem,0.9fr)_minmax(7.5rem,1.1fr)_minmax(3.25rem,0.55fr)_minmax(3.25rem,0.55fr)]";
export const TIER_TABLE_GRID_COLS_WITH_ACTION =
	"grid-cols-[minmax(7.5rem,1.15fr)_minmax(5.5rem,0.9fr)_minmax(5.5rem,0.9fr)_minmax(7.5rem,1.1fr)_minmax(4.5rem,0.7fr)_2.5rem]";

export function tierTableCell(className?: string) {
	return cn(
		"flex min-h-[2.75rem] items-center border-r border-[var(--iz-line)] px-2 py-1.5 last:border-r-0",
		className,
	);
}

export function tierTableEditableCell(className?: string) {
	return cn(
		tierTableCell(className),
		"cursor-text bg-white/[0.03] transition-colors hover:bg-[rgba(183,156,232,0.07)] focus-within:bg-[rgba(183,156,232,0.1)] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[rgba(183,156,232,0.28)]",
	);
}

export function tierTableReadonlyCell(className?: string) {
	return cn(tierTableCell(className), "bg-black/15 text-[var(--iz-muted)]");
}

export function formatTierHourlyRate(n: number): string {
	if (n <= 0) return "—";
	const rounded = Math.round(n * 100) / 100;
	return Number.isInteger(rounded)
		? String(rounded)
		: rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function TierRmHrReadonly({ amount }: { amount: number }) {
	if (amount <= 0) {
		return <span className="text-xs text-[var(--iz-muted)]">—</span>;
	}
	return (
		<div className="flex min-w-0 items-center justify-center gap-0.5">
			<span className="text-[9px] text-[var(--iz-muted)]">RM</span>
			<span className="text-sm font-semibold tabular-nums text-[var(--iz-txt)]">
				{formatTierHourlyRate(amount)}
			</span>
		</div>
	);
}
export function tierTableHeadCell(className?: string, editable?: boolean) {
	return cn(
		"border-r border-[var(--iz-line)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide last:border-r-0",
		editable ? "text-[var(--iz-gold-l)]/80" : "text-[var(--iz-muted)]",
		className,
	);
}

/**
 * `standardShiftHours` captions the two DERIVED columns.
 *
 * RM/HR is `daily wage ÷ standard shift hours` and OT/HR is 1.5× that, so both
 * are only true for a shift of that length — and the backend prices real
 * overtime against the shift's OWN booked window, not this figure. Without the
 * caption an outlet reads "OT/HR RM125" off a 6-hour ladder, books a 2-hour
 * shift, and is billed RM375/h.
 *
 * Pass `null` when the tiers disagree on their standard length: the rule is then
 * still stated, but no single number is claimed for all of them. The other
 * columns — daily wage, target sales, drink/tip % — do NOT vary with shift
 * length, which is why this caption names only these two.
 */
export function TierRatesTableLegend({
	standardShiftHours,
}: {
	standardShiftHours?: number | null;
} = {}) {
	return (
		<div className="border-t border-[var(--iz-line)] px-2 py-1.5 text-[10px] leading-snug text-[var(--iz-muted2)]">
			<span className="text-[var(--iz-gold-l)]/90">Highlighted cells</span> are
			editable · tap to change ·{" "}
			<span className="text-[var(--iz-muted)]">dimmed cells</span> are read-only
			<div className="mt-1">
				<span className="text-[var(--iz-muted)]">RM/HR</span> and{" "}
				<span className="text-[var(--iz-muted)]">OT/HR</span> are worked out
				from the daily wage
				{standardShiftHours
					? ` over a ${standardShiftHours}-hour standard shift`
					: " over each tier's standard shift"}{" "}
				— OT is 1.5× the hourly rate. Both follow the shift you actually book: a
				shorter shift makes every hour, and every overtime hour, worth more.
			</div>
		</div>
	);
}
