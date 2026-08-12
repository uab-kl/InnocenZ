import type { AgencyPenaltyRules } from "@agency-portal/lib/pr-penalties";
import { cn } from "@agency-portal/lib/utils";

function NumInput({
	value,
	onChange,
	suffix,
	prefix,
	readOnly,
	width = "w-14",
}: {
	value: number;
	onChange: (n: number) => void;
	suffix?: string;
	prefix?: string;
	readOnly?: boolean;
	width?: string;
}) {
	return (
		<div className="flex items-center gap-1.5 rounded-lg border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5">
			{prefix && (
				<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
					{prefix}
				</span>
			)}
			<input
				type="text"
				inputMode="numeric"
				value={String(value)}
				readOnly={readOnly}
				onChange={(e) => {
					if (readOnly) return;
					const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
					onChange(Number.isNaN(n) ? 0 : n);
				}}
				className={cn(
					width,
					"bg-transparent text-sm font-semibold tabular-nums outline-none",
				)}
			/>
			{suffix && (
				<span className="text-[10px] text-[var(--iz-muted)]">{suffix}</span>
			)}
		</div>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="min-w-0">
			<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
				{label}
			</div>
			{children}
		</div>
	);
}

function RuleRow({
	icon,
	title,
	desc,
	enabled,
	onToggleEnabled,
	readOnly,
	children,
}: {
	icon: string;
	title: string;
	desc: string;
	enabled: boolean;
	onToggleEnabled: () => void;
	readOnly?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"rounded-xl border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-3",
				!enabled && "opacity-55",
			)}
		>
			<div className="flex items-start gap-2.5">
				<span className="mt-0.5 text-base leading-none" aria-hidden>
					{icon}
				</span>
				<div className="min-w-0 flex-1">
					<div className="text-sm font-semibold text-[var(--iz-txt)]">
						{title}
					</div>
					<div className="iz-tiny text-[var(--iz-muted)]">{desc}</div>
				</div>
				<button
					type="button"
					disabled={readOnly}
					onClick={() => !readOnly && onToggleEnabled()}
					aria-pressed={enabled}
					className={cn(
						"relative h-6 w-11 shrink-0 rounded-full transition-colors",
						enabled ? "bg-[var(--iz-green)]" : "bg-[var(--iz-line2)]",
						readOnly && "opacity-70",
					)}
				>
					<span
						className={cn(
							"absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
							enabled ? "right-0.5" : "left-0.5",
						)}
					/>
				</button>
			</div>
			<div className="mt-3 flex flex-wrap items-end gap-4 border-t border-[var(--iz-line)] pt-3">
				{children}
			</div>
		</div>
	);
}

export function PenaltyRulesEditor({
	rules,
	onChange,
	readOnly,
}: {
	rules: AgencyPenaltyRules;
	onChange: (next: AgencyPenaltyRules) => void;
	readOnly?: boolean;
}) {
	const patch = <K extends keyof AgencyPenaltyRules>(
		key: K,
		partial: Partial<AgencyPenaltyRules[K]>,
	) => {
		onChange({ ...rules, [key]: { ...rules[key], ...partial } });
	};

	return (
		<div className="flex flex-col gap-2.5">
			<RuleRow
				icon="📅"
				title="Minimum shifts per week"
				desc="Working fewer than this triggers a penalty — but only if you assigned at least this many."
				enabled={rules.minShiftsPerWeek.enabled}
				onToggleEnabled={() =>
					patch("minShiftsPerWeek", {
						enabled: !rules.minShiftsPerWeek.enabled,
					})
				}
				readOnly={readOnly}
			>
				<Field label="Min / week">
					<NumInput
						value={rules.minShiftsPerWeek.minShiftsPerWeek}
						onChange={(n) => patch("minShiftsPerWeek", { minShiftsPerWeek: n })}
						suffix="shifts"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Fine">
					<NumInput
						value={rules.minShiftsPerWeek.fineRm}
						onChange={(n) => patch("minShiftsPerWeek", { fineRm: n })}
						prefix="RM"
						readOnly={readOnly}
					/>
				</Field>
			</RuleRow>

			<RuleRow
				icon="🩺"
				title="MC cap per month"
				desc="A fine applies for each MC taken over the monthly cap."
				enabled={rules.maxMcPerMonth.enabled}
				onToggleEnabled={() =>
					patch("maxMcPerMonth", { enabled: !rules.maxMcPerMonth.enabled })
				}
				readOnly={readOnly}
			>
				<Field label="Max / month">
					<NumInput
						value={rules.maxMcPerMonth.maxMcPerMonth}
						onChange={(n) => patch("maxMcPerMonth", { maxMcPerMonth: n })}
						suffix="MC"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Fine / excess">
					<NumInput
						value={rules.maxMcPerMonth.finePerExcessRm}
						onChange={(n) => patch("maxMcPerMonth", { finePerExcessRm: n })}
						prefix="RM"
						readOnly={readOnly}
					/>
				</Field>
			</RuleRow>

			<RuleRow
				icon="⏰"
				title="Lateness per week"
				desc="Being late this many times in a week is fined."
				enabled={rules.latePerWeek.enabled}
				onToggleEnabled={() =>
					patch("latePerWeek", { enabled: !rules.latePerWeek.enabled })
				}
				readOnly={readOnly}
			>
				<Field label="Late / week">
					<NumInput
						value={rules.latePerWeek.maxLatePerWeek}
						onChange={(n) => patch("latePerWeek", { maxLatePerWeek: n })}
						suffix="times"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Grace">
					<NumInput
						value={rules.latePerWeek.graceMinutes}
						onChange={(n) => patch("latePerWeek", { graceMinutes: n })}
						suffix="min"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Fine">
					<NumInput
						value={rules.latePerWeek.fineRm}
						onChange={(n) => patch("latePerWeek", { fineRm: n })}
						prefix="RM"
						readOnly={readOnly}
					/>
				</Field>
			</RuleRow>

			<RuleRow
				icon="🚫"
				title="Shift cancellation"
				desc="Cancelling a booked shift costs a share of that shift's daily wage."
				enabled={rules.cancellation.enabled}
				onToggleEnabled={() =>
					patch("cancellation", { enabled: !rules.cancellation.enabled })
				}
				readOnly={readOnly}
			>
				<Field label="Free cancel">
					<NumInput
						value={rules.cancellation.freeCancelHours}
						onChange={(n) => patch("cancellation", { freeCancelHours: n })}
						prefix="≥"
						suffix="h before"
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Short notice">
					<NumInput
						value={rules.cancellation.shortNoticeHours}
						onChange={(n) => patch("cancellation", { shortNoticeHours: n })}
						prefix="≥"
						suffix="h before"
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Short-notice charge">
					<NumInput
						value={rules.cancellation.shortNoticePct}
						onChange={(n) => patch("cancellation", { shortNoticePct: n })}
						suffix="% wages"
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label="Late charge">
					<NumInput
						value={rules.cancellation.lateCancelPct}
						onChange={(n) => patch("cancellation", { lateCancelPct: n })}
						suffix="% wages"
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
			</RuleRow>

			{/* The three bands spelled out, so the two hour fields above cannot be
			    read as independent numbers — they are boundaries of one scale, and
			    setting short notice above free cancel would silently erase a band. */}
			<p className="iz-tiny text-[var(--iz-muted)]">
				Cancelling ≥ {rules.cancellation.freeCancelHours}h before is free ·{" "}
				{rules.cancellation.shortNoticeHours}–
				{rules.cancellation.freeCancelHours}h costs{" "}
				{rules.cancellation.shortNoticePct}% · under{" "}
				{rules.cancellation.shortNoticeHours}h costs{" "}
				{rules.cancellation.lateCancelPct}% of the shift's daily wage.
			</p>
			{rules.cancellation.shortNoticeHours >=
				rules.cancellation.freeCancelHours && (
				<p className="iz-tiny text-[var(--iz-red,#e5484d)]">
					Short notice must be fewer hours than free cancel, or the{" "}
					{rules.cancellation.shortNoticePct}% band never applies.
				</p>
			)}

			<p className="iz-tiny text-[var(--iz-muted)]">
				Every enabled rule applies to all PRs. Fines apply per breach and deduct
				from the next payment voucher. Set a fine to RM 0 for a warning only.
			</p>
		</div>
	);
}
