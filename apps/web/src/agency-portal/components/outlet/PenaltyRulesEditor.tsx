import {
	type OutletPenaltyRules,
	PR_PAY_CLASS_LABELS,
	PR_PAY_CLASSES,
	type PrPayClass,
} from "@agency-portal/lib/pr-penalties";
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

function ScopeChips({
	value,
	onToggle,
	readOnly,
}: {
	value: PrPayClass[];
	onToggle: (cls: PrPayClass) => void;
	readOnly?: boolean;
}) {
	return (
		<Field label="Applies to">
			<div className="flex gap-1.5">
				{PR_PAY_CLASSES.map((cls) => {
					const on = value.includes(cls);
					return (
						<button
							key={cls}
							type="button"
							disabled={readOnly}
							onClick={() => !readOnly && onToggle(cls)}
							className={cn(
								"rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
								on
									? "border-[var(--iz-gold)] bg-[rgba(212,175,110,0.14)] text-[var(--iz-gold-l)]"
									: "border-[var(--iz-line2)] text-[var(--iz-muted)]",
								readOnly && "opacity-70",
							)}
						>
							{on ? "✓ " : ""}
							{PR_PAY_CLASS_LABELS[cls]}
						</button>
					);
				})}
			</div>
		</Field>
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
	rules: OutletPenaltyRules;
	onChange: (next: OutletPenaltyRules) => void;
	readOnly?: boolean;
}) {
	const patch = <K extends keyof OutletPenaltyRules>(
		key: K,
		partial: Partial<OutletPenaltyRules[K]>,
	) => {
		onChange({ ...rules, [key]: { ...rules[key], ...partial } });
	};

	const toggleScope = <K extends keyof OutletPenaltyRules>(
		key: K,
		cls: PrPayClass,
	) => {
		const current = rules[key].appliesTo;
		const next = current.includes(cls)
			? current.filter((c) => c !== cls)
			: [...current, cls];
		patch(key, { appliesTo: next } as Partial<OutletPenaltyRules[K]>);
	};

	return (
		<div className="flex flex-col gap-2.5">
			<RuleRow
				icon="📅"
				title="Minimum shifts per week"
				desc="Working fewer than this in a week triggers a penalty."
				enabled={rules.minShiftsPerWeek.enabled}
				onToggleEnabled={() =>
					patch("minShiftsPerWeek", {
						enabled: !rules.minShiftsPerWeek.enabled,
					})
				}
				readOnly={readOnly}
			>
				<ScopeChips
					value={rules.minShiftsPerWeek.appliesTo}
					onToggle={(cls) => toggleScope("minShiftsPerWeek", cls)}
					readOnly={readOnly}
				/>
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
				<ScopeChips
					value={rules.maxMcPerMonth.appliesTo}
					onToggle={(cls) => toggleScope("maxMcPerMonth", cls)}
					readOnly={readOnly}
				/>
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
				<ScopeChips
					value={rules.latePerWeek.appliesTo}
					onToggle={(cls) => toggleScope("latePerWeek", cls)}
					readOnly={readOnly}
				/>
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

			<p className="iz-tiny text-[var(--iz-muted)]">
				Fines apply per breach and deduct from the next payment voucher. Set a
				fine to RM 0 for a warning only.
			</p>
		</div>
	);
}
