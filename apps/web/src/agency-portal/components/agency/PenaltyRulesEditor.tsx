import type { AgencyPenaltyRules } from "@agency-portal/lib/pr-penalties";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const { t } = usePortalLocale();
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
				title={t.penalties.minShiftsTitle}
				desc={t.penalties.minShiftsDesc}
				enabled={rules.minShiftsPerWeek.enabled}
				onToggleEnabled={() =>
					patch("minShiftsPerWeek", {
						enabled: !rules.minShiftsPerWeek.enabled,
					})
				}
				readOnly={readOnly}
			>
				<Field label={t.penalties.minPerWeek}>
					<NumInput
						value={rules.minShiftsPerWeek.minShiftsPerWeek}
						onChange={(n) => patch("minShiftsPerWeek", { minShiftsPerWeek: n })}
						suffix={t.penalties.shiftsUnit}
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.fine}>
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
				title={t.penalties.mcCapTitle}
				desc={t.penalties.mcCapDesc}
				enabled={rules.maxMcPerMonth.enabled}
				onToggleEnabled={() =>
					patch("maxMcPerMonth", { enabled: !rules.maxMcPerMonth.enabled })
				}
				readOnly={readOnly}
			>
				<Field label={t.penalties.maxPerMonth}>
					<NumInput
						value={rules.maxMcPerMonth.maxMcPerMonth}
						onChange={(n) => patch("maxMcPerMonth", { maxMcPerMonth: n })}
						suffix={t.penalties.mcUnit}
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.finePerExcess}>
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
				title={t.penalties.latenessTitle}
				desc={t.penalties.latenessDesc}
				enabled={rules.latePerWeek.enabled}
				onToggleEnabled={() =>
					patch("latePerWeek", { enabled: !rules.latePerWeek.enabled })
				}
				readOnly={readOnly}
			>
				<Field label={t.penalties.latePerWeek}>
					<NumInput
						value={rules.latePerWeek.maxLatePerWeek}
						onChange={(n) => patch("latePerWeek", { maxLatePerWeek: n })}
						suffix={t.penalties.timesUnit}
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.grace}>
					<NumInput
						value={rules.latePerWeek.graceMinutes}
						onChange={(n) => patch("latePerWeek", { graceMinutes: n })}
						suffix={t.penalties.minUnit}
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.fine}>
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
				title={t.penalties.cancellationTitle}
				desc={t.penalties.cancellationDesc}
				enabled={rules.cancellation.enabled}
				onToggleEnabled={() =>
					patch("cancellation", { enabled: !rules.cancellation.enabled })
				}
				readOnly={readOnly}
			>
				<Field label={t.penalties.freeCancel}>
					<NumInput
						value={rules.cancellation.freeCancelHours}
						onChange={(n) => patch("cancellation", { freeCancelHours: n })}
						prefix="≥"
						suffix={t.penalties.hBefore}
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.shortNotice}>
					<NumInput
						value={rules.cancellation.shortNoticeHours}
						onChange={(n) => patch("cancellation", { shortNoticeHours: n })}
						prefix="≥"
						suffix={t.penalties.hBefore}
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.shortNoticeCharge}>
					<NumInput
						value={rules.cancellation.shortNoticePct}
						onChange={(n) => patch("cancellation", { shortNoticePct: n })}
						suffix={t.penalties.pctWages}
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.lateCharge}>
					<NumInput
						value={rules.cancellation.lateCancelPct}
						onChange={(n) => patch("cancellation", { lateCancelPct: n })}
						suffix={t.penalties.pctWages}
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
			</RuleRow>

			{/* The three bands spelled out, so the two hour fields above cannot be
			    read as independent numbers — they are boundaries of one scale, and
			    setting short notice above free cancel would silently erase a band. */}
			<p className="iz-tiny text-[var(--iz-muted)]">
				{fill(t.penalties.cancellationBands, {
					free: rules.cancellation.freeCancelHours,
					short: rules.cancellation.shortNoticeHours,
					shortPct: rules.cancellation.shortNoticePct,
					latePct: rules.cancellation.lateCancelPct,
				})}
			</p>
			{rules.cancellation.shortNoticeHours >=
				rules.cancellation.freeCancelHours && (
				<p className="iz-tiny text-[var(--iz-red,#e5484d)]">
					{fill(t.penalties.shortNoticeOrderWarning, {
						pct: rules.cancellation.shortNoticePct,
					})}
				</p>
			)}

			<p className="iz-tiny text-[var(--iz-muted)]">{t.penalties.footer}</p>
		</div>
	);
}
