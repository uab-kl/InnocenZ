import { serverMessage } from "@agency-portal/hooks/use-org-members";
import type { AgencyPenaltyRules } from "@agency-portal/lib/pr-penalties";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/** Postgres `integer` — the server refuses anything past it. */
const INPUT_MAX = 2_147_483_647;

/**
 * The server's ranges (apps/backend agency-penalty-rule.schema.ts), applied to
 * the rules the server checks: the ENABLED ones. A disabled rule keeps whatever
 * it holds, exactly as the server lets it, so switching lateness off with 0 in
 * it still saves the other three. Switching it back ON clamps it here, before
 * the save, instead of earning a refusal.
 */
export function clampEnabledPenaltyRules(
	rules: AgencyPenaltyRules,
): AgencyPenaltyRules {
	// No rounding: an RM fine may carry sen (the column is numeric(12,2)), and a
	// clamp that truncated would quietly cut RM 50.50 to RM 50.00 on any save.
	const clamp = (n: number, min: number, max = INPUT_MAX) =>
		Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
	const { minShiftsPerWeek: ms, maxMcPerMonth: mc, latePerWeek: lt } = rules;
	const cx = rules.cancellation;
	return {
		minShiftsPerWeek: ms.enabled
			? {
					...ms,
					fineRm: clamp(ms.fineRm, 0),
					minShiftsPerWeek: clamp(ms.minShiftsPerWeek, 0),
				}
			: ms,
		maxMcPerMonth: mc.enabled
			? {
					...mc,
					fineRm: clamp(mc.fineRm, 0),
					maxMcPerMonth: clamp(mc.maxMcPerMonth, 0),
					finePerExcessRm: clamp(mc.finePerExcessRm, 0),
				}
			: mc,
		// At least 1: lateness fires at `>=` the limit, so 0 fines every PR.
		latePerWeek: lt.enabled
			? {
					...lt,
					fineRm: clamp(lt.fineRm, 0),
					maxLatePerWeek: clamp(lt.maxLatePerWeek, 1),
					graceMinutes: clamp(lt.graceMinutes, 0),
				}
			: lt,
		cancellation: cx.enabled
			? {
					...cx,
					fineRm: clamp(cx.fineRm, 0),
					freeCancelHours: clamp(cx.freeCancelHours, 0),
					shortNoticeHours: clamp(cx.shortNoticeHours, 0),
					shortNoticePct: clamp(cx.shortNoticePct, 0, 100),
					lateCancelPct: clamp(cx.lateCancelPct, 0, 100),
				}
			: cx,
	};
}

/**
 * The one refusal no clamp can settle: an ENABLED cancellation rule whose short
 * notice is LONGER than its free window (the server refuses it; equal is
 * allowed and only warned). Which number to move is the owner's choice, so the
 * change is held back and the reason shown instead of sent.
 */
export function cancellationBandsInverted(rules: AgencyPenaltyRules): boolean {
	const c = rules.cancellation;
	return c.enabled && c.shortNoticeHours > c.freeCancelHours;
}

function NumInput({
	value,
	onChange,
	suffix,
	prefix,
	readOnly,
	width = "w-14",
	min = 0,
	max = INPUT_MAX,
}: {
	value: number;
	onChange: (n: number) => void;
	suffix?: string;
	prefix?: string;
	readOnly?: boolean;
	width?: string;
	/** The same bounds the server holds an enabled rule to. */
	min?: number;
	max?: number;
}) {
	// What is being typed. An emptied box used to become 0 on the spot — and
	// with every change saved, that SAVED 0 mid-edit (a 0 late limit fines every
	// PR). Now an empty box stays empty while focused and settles to `min` only
	// if left empty; anything typed is clamped to [min, max] before it leaves.
	const [draft, setDraft] = useState<string | null>(null);
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
				value={draft ?? String(value)}
				readOnly={readOnly}
				onChange={(e) => {
					if (readOnly) return;
					const digits = e.target.value.replace(/[^\d]/g, "");
					if (digits === "") {
						setDraft("");
						return;
					}
					const n = Math.min(max, Math.max(min, Number.parseInt(digits, 10)));
					setDraft(String(n));
					onChange(n);
				}}
				onBlur={() => {
					if (!readOnly && draft === "" && value !== min) onChange(min);
					setDraft(null);
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
	/**
	 * Every change is a save of ALL FOUR rules. Return the save's promise and a
	 * refusal is shown here in the server's own words — the save replaces the
	 * whole set, so a refused one changed nothing and must not look like it did.
	 */
	onChange: (next: AgencyPenaltyRules) => void | Promise<unknown>;
	readOnly?: boolean;
}) {
	const { t } = usePortalLocale();
	const [refusal, setRefusal] = useState<string | null>(null);
	const patch = <K extends keyof AgencyPenaltyRules>(
		key: K,
		partial: Partial<AgencyPenaltyRules[K]>,
	) => {
		const next = clampEnabledPenaltyRules({
			...rules,
			[key]: { ...rules[key], ...partial },
		});
		if (cancellationBandsInverted(next)) {
			setRefusal(
				`${t.managePr.couldNotSavePenaltyRules} — ${fill(
					t.penalties.shortNoticeOrderWarning,
					{ pct: next.cancellation.shortNoticePct },
				)}`,
			);
			return;
		}
		setRefusal(null);
		const pending = onChange(next);
		if (pending && typeof pending.then === "function") {
			pending.then(undefined, (error: unknown) =>
				setRefusal(serverMessage(error, t.managePr.couldNotSavePenaltyRules)),
			);
		}
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
						min={1}
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
						max={100}
						suffix={t.penalties.pctWages}
						width="w-10"
						readOnly={readOnly}
					/>
				</Field>
				<Field label={t.penalties.lateCharge}>
					<NumInput
						value={rules.cancellation.lateCancelPct}
						onChange={(n) => patch("cancellation", { lateCancelPct: n })}
						max={100}
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
			{/* A change NOT saved says so, in place of the standing warning. */}
			{refusal ? (
				<p role="alert" className="iz-tiny text-[var(--iz-red,#e5484d)]">
					{refusal}
				</p>
			) : (
				rules.cancellation.shortNoticeHours >=
					rules.cancellation.freeCancelHours && (
					<p className="iz-tiny text-[var(--iz-red,#e5484d)]">
						{fill(t.penalties.shortNoticeOrderWarning, {
							pct: rules.cancellation.shortNoticePct,
						})}
					</p>
				)
			)}

			<p className="iz-tiny text-[var(--iz-muted)]">{t.penalties.footer}</p>
		</div>
	);
}
