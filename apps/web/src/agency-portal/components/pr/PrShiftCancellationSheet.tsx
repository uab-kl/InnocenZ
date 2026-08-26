import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle } from "@agency-portal/components/iz/ui";
import type { CancellationRule } from "@agency-portal/lib/pr-penalties";
import {
	CANCEL_RULES,
	type CancellationEvaluation,
	type CancellationTier,
	DEFAULT_CANCELLATION_RULE,
} from "@agency-portal/lib/pr-schedule-cancellation";
import { cn } from "@agency-portal/lib/utils";
import { AlertTriangle } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

function tierAlertClass(tier: CancellationTier) {
	if (tier === "safe")
		return "border-[rgba(74,222,128,.35)] bg-[rgba(74,222,128,.08)]";
	if (tier === "short_notice")
		return "border-[rgba(244,183,64,.35)] bg-[rgba(244,183,64,.08)]";
	return "border-[rgba(255,107,107,.35)] bg-[rgba(255,107,107,.08)]";
}

export type CancellationBandRow = {
	/** Stable across a locale switch — the LABEL is not, and keying on it remounts every row. */
	id: "always" | "free" | "short" | "late";
	label: string;
	outcome: string;
	tone: "green" | "amber" | "red";
};

/**
 * The agency's notice bands, worded for the PR.
 *
 * The display mirror of `cancellationRuleSummary()`: same rule object, same
 * three bands, but every hour and percentage arrives as a `{placeholder}` the
 * dictionary fills. Baking "12h" or "50%" into the Chinese would make the copy
 * a SECOND source of truth for numbers the agency edits on Manage PR — which is
 * the exact drift that once showed a PR −50% while charging them −25%.
 */
export function cancellationBandRows(
	t: PortalTranslations,
	rule: CancellationRule = DEFAULT_CANCELLATION_RULE,
): CancellationBandRow[] {
	if (!rule.enabled) {
		return [
			{
				id: "always",
				label: t.prPortal.bandAnyTimeLabel,
				outcome: t.prPortal.bandAnyTimeOutcome,
				tone: "green",
			},
		];
	}
	return [
		{
			id: "free",
			label: fill(t.prPortal.bandFreeLabel, { free: rule.freeCancelHours }),
			outcome: t.prPortal.bandFreeOutcome,
			tone: "green",
		},
		{
			id: "short",
			label: fill(t.prPortal.bandShortLabel, {
				short: rule.shortNoticeHours,
				free: rule.freeCancelHours,
			}),
			outcome: fill(t.prPortal.bandWagePctOutcome, {
				pct: rule.shortNoticePct,
			}),
			tone: "amber",
		},
		{
			id: "late",
			label: fill(t.prPortal.bandLateLabel, {
				short: rule.shortNoticeHours,
				min: CANCEL_RULES.lateArrivalMinutes,
			}),
			outcome: fill(t.prPortal.bandWagePctOutcome, { pct: rule.lateCancelPct }),
			tone: "red",
		},
	];
}

/**
 * The evaluated band as the PR reads it.
 *
 * `evaluation.headline` / `.detail` are built in English inside the evaluator,
 * which also packs the money and the hours into the sentence. Re-derived here
 * from the parts it does expose — tier, deduction, hours — so the sentence can
 * be written in either language rather than translated word by word.
 */
function evaluationCopy(
	t: PortalTranslations,
	evaluation: CancellationEvaluation,
	rule: CancellationRule,
): { headline: string; detail: string } {
	const amount = `RM ${evaluation.deductionRm}`;
	if (evaluation.tier === "short_notice") {
		return {
			headline: fill(t.prPortal.cancelShortNoticeHeadline, { amount }),
			detail: fill(t.prPortal.cancelShortNoticeDetail, {
				free: rule.freeCancelHours,
				short: rule.shortNoticeHours,
			}),
		};
	}
	if (evaluation.tier === "penalty") {
		return {
			headline: fill(t.prPortal.cancelLateHeadline, { amount }),
			detail:
				evaluation.hoursUntilStart <= 0
					? fill(t.prPortal.cancelLateDetailStarted, {
							min: CANCEL_RULES.lateArrivalMinutes,
						})
					: fill(t.prPortal.cancelLateDetailBefore, {
							short: rule.shortNoticeHours,
							min: CANCEL_RULES.lateArrivalMinutes,
						}),
		};
	}
	return {
		headline: t.prPortal.cancelOnTimeHeadline,
		detail: rule.enabled
			? fill(t.prPortal.cancelOnTimeDetail, {
					hours: Math.floor(evaluation.hoursUntilStart),
				})
			: t.prPortal.cancelNoChargeDetail,
	};
}

export function PrShiftCancellationSheet({
	open,
	onClose,
	title,
	outlet,
	dateLine,
	shiftLine,
	evaluation,
	reason,
	onReasonChange,
	onSubmit,
	submitLabel,
	rule = DEFAULT_CANCELLATION_RULE,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	outlet: string;
	dateLine: string;
	shiftLine?: string;
	evaluation: CancellationEvaluation | null;
	reason: string;
	onReasonChange: (value: string) => void;
	onSubmit: () => void;
	submitLabel: string;
	rule?: CancellationRule;
}) {
	const { t } = usePortalLocale();
	const copy = evaluation ? evaluationCopy(t, evaluation, rule) : null;

	return (
		<IzSheet open={open} onClose={onClose}>
			<IzCardTitle>{title}</IzCardTitle>
			<p className="iz-tiny iz-muted mb-2">
				<strong className="text-[var(--iz-txt)]">{outlet}</strong>
				{dateLine ? ` · ${dateLine}` : ""}
				{shiftLine ? ` · ${shiftLine}` : ""}
			</p>
			<p className="iz-pr-note mb-3">{t.prPortal.assignedByAgencyNote}</p>
			{evaluation && copy && (
				<div
					className={cn(
						"mb-3 rounded-xl border px-3 py-2.5",
						tierAlertClass(evaluation.tier),
					)}
				>
					<p className="text-sm font-semibold">{copy.headline}</p>
					<p className="iz-tiny iz-muted2 mt-1">{copy.detail}</p>
				</div>
			)}
			<div className="mb-3 overflow-hidden rounded-xl border border-[var(--iz-line)]">
				<div className="iz-pr-schedule-rules-hd !cursor-default border-0 bg-transparent">
					<AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-amber)]" />
					<span className="text-xs font-bold uppercase tracking-wide text-[var(--iz-txt)]">
						{t.prPortal.cancellationRules}
					</span>
				</div>
				<ul className="iz-pr-schedule-rules-list !mt-0 border-0">
					{cancellationBandRows(t, rule).map((r) => (
						<li key={r.id} className={`tone-${r.tone}`}>
							<span className="rule-when">{r.label}</span>
							<span className="rule-out">{r.outcome}</span>
						</li>
					))}
				</ul>
			</div>
			<label
				className="iz-tiny iz-muted2 mb-1 block"
				htmlFor="pr-shift-cancel-reason"
			>
				{t.prPortal.reasonRequired}
			</label>
			<textarea
				id="pr-shift-cancel-reason"
				className="iz-pv-dispute-input mb-3"
				rows={3}
				placeholder={t.prPortal.cancelReasonPlaceholder}
				value={reason}
				onChange={(e) => onReasonChange(e.target.value)}
			/>
			<button
				type="button"
				className="iz-btn iz-btn-danger w-full"
				disabled={!reason.trim()}
				onClick={onSubmit}
			>
				{submitLabel}
			</button>
		</IzSheet>
	);
}
