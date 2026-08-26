import { formatRM, IzCard } from "@agency-portal/components/iz/ui";
import { PrStatusPill } from "@agency-portal/components/pr/PrOfferRow";
import { PrPvDisputeSheet } from "@agency-portal/components/pr/PrPvDisputeSheet";
import { PrWeeklyPaymentGrid } from "@agency-portal/components/pr/PrWeeklyPaymentGrid";
import type { PrPaymentVoucher, PrPvStatus } from "@agency-portal/lib/pr-demo";
import {
	pvNeedsPrReview,
	pvStatusPillVariant,
} from "@agency-portal/lib/pr-demo";
import { isPrPaymentActionPv } from "@agency-portal/lib/pr-payment-history";
import {
	buildWeeklyDisputeMessage,
	pvHasOpenDisputes,
	type WeeklyDisputeTarget,
	type WeeklyPaymentSummary,
} from "@agency-portal/lib/pr-weekly-payment";
import { cn } from "@agency-portal/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

function weekTotalRm(summary: WeeklyPaymentSummary): number {
	const n = summary.totals.net;
	return Number.isFinite(n) ? n : 0;
}

/**
 * The PV's workflow state, worded for the PR.
 *
 * Keyed by the API's own enum, which never changes — and deliberately NOT the
 * agency's `payroll.status*` wording: the two sides of a voucher call the same
 * state different things ("Pending PR Review" is "Awaiting your review" here).
 * `pvStatusLabel()` returned the raw enum for four of the five states, so a PR
 * on a Chinese page was reading SENT / SIGNED / PAID / DISPUTED.
 */
function prPvStatusLabel(status: PrPvStatus, t: PortalTranslations): string {
	const map: Record<PrPvStatus, string> = {
		PENDING_REVIEW: t.prPortal.pvStatusPendingReview,
		SENT: t.prPortal.pvStatusSent,
		SIGNED: t.prPortal.pvStatusSigned,
		PAID: t.prPortal.pvStatusPaid,
		DISPUTED: t.prPortal.pvStatusDisputed,
	};
	return map[status] ?? status;
}

export function PrWeeklyPaymentWeekCard({
	title,
	summary,
	weekPhase,
	defaultOpen = true,
	pv,
	onOpenPv,
	onDispute,
	onWithdrawDispute,
}: {
	title: string;
	summary: WeeklyPaymentSummary;
	weekPhase: "open" | "issued";
	defaultOpen?: boolean;
	pv?: PrPaymentVoucher | null;
	onOpenPv?: (id: string) => void;
	onDispute?: (
		reason: string,
		photoDataUrls?: string[],
		targets?: WeeklyDisputeTarget[],
	) => void;
	onWithdrawDispute?: (targets: WeeklyDisputeTarget[]) => void;
}) {
	const { t } = usePortalLocale();
	const [open, setOpen] = useState(defaultOpen);
	const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
	const [disputeMode, setDisputeMode] = useState<"dispute" | "withdraw">(
		"dispute",
	);
	const [disputeReason, setDisputeReason] = useState("");
	const [disputePhotos, setDisputePhotos] = useState<string[]>([]);
	const [disputeTargets, setDisputeTargets] = useState<WeeklyDisputeTarget[]>(
		[],
	);
	const [activeDisputeKey, setActiveDisputeKey] = useState<string | null>(null);

	const needsReview = Boolean(
		pv && (pvNeedsPrReview(pv.status) || pv.status === "DISPUTED"),
	);
	const actionPv = pv && isPrPaymentActionPv(pv) ? pv : null;
	const canDispute = Boolean(
		weekPhase === "issued" && actionPv && needsReview && onDispute,
	);
	const hasOpenDisputes = Boolean(pv && pvHasOpenDisputes(pv, summary));

	const openDisputeForDay = (targets: WeeklyDisputeTarget[]) => {
		if (!canDispute || targets.length === 0) return;
		// `target`, never `t` — a callback named `t` shadows the locale dictionary
		// this component now reads, and the shadow type-checks.
		const text = targets
			.map((target) => buildWeeklyDisputeMessage(target))
			.join("\n\n");
		setDisputeMode("dispute");
		setDisputeTargets(targets);
		setDisputeReason(text);
		if (targets.length === 1) {
			const target = targets[0];
			setActiveDisputeKey(`${target.dateIso}-${target.incomeKey}`);
		} else {
			setActiveDisputeKey(null);
		}
		setDisputeSheetOpen(true);
	};

	const openWithdrawForDay = (targets: WeeklyDisputeTarget[]) => {
		if (!actionPv || !onWithdrawDispute || targets.length === 0) return;
		setDisputeMode("withdraw");
		setDisputeTargets(targets);
		setDisputeReason("");
		if (targets.length === 1) {
			const target = targets[0];
			setActiveDisputeKey(`${target.dateIso}-${target.incomeKey}`);
		} else {
			setActiveDisputeKey(null);
		}
		setDisputeSheetOpen(true);
	};

	const closeDisputeSheet = () => {
		setDisputeSheetOpen(false);
		setDisputeTargets([]);
		setActiveDisputeKey(null);
	};

	const submitDispute = () => {
		if (!onDispute || !disputeReason.trim()) return;
		onDispute(
			disputeReason,
			disputePhotos.length ? disputePhotos : undefined,
			disputeTargets.length ? disputeTargets : undefined,
		);
		closeDisputeSheet();
		setDisputeReason("");
		setDisputePhotos([]);
	};

	const submitWithdraw = () => {
		if (!onWithdrawDispute || disputeTargets.length === 0) return;
		onWithdrawDispute(disputeTargets);
		closeDisputeSheet();
	};

	return (
		<section
			className={cn(
				"iz-collapsible-section iz-pr-week-pay-collapsible",
				open && "is-open",
				needsReview && "iz-pr-week-pay-collapsible--review",
			)}
		>
			<button
				type="button"
				className="iz-collapsible-section__trigger"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<span className="min-w-0 flex-1">
					<span className="iz-collapsible-section__title">{title}</span>
					{!open && (
						<span className="iz-collapsible-section__hint">
							{fill(t.prPortal.weekCollapsedHint, {
								week: summary.weekLabel,
								total: formatRM(weekTotalRm(summary)),
								verified: summary.verifiedDayCount,
							})}
						</span>
					)}
					<span className="iz-collapsible-section__action">
						{open ? t.common.tapToCollapse : t.common.tapToExpand}
					</span>
				</span>
				{pv && (
					<PrStatusPill variant={pvStatusPillVariant(pv.status)}>
						{prPvStatusLabel(pv.status, t)}
					</PrStatusPill>
				)}
				<span className="iz-pr-week-pay-collapsible__verified font-sora text-base font-extrabold text-[var(--iz-violet-l)]">
					{summary.verifiedDayCount}/7
				</span>
				<span className="iz-collapsible-section__chev" aria-hidden>
					<ChevronDown
						className={cn(
							"h-4 w-4 transition-transform duration-200",
							open && "rotate-180",
						)}
					/>
				</span>
			</button>
			{open && (
				<div className="iz-collapsible-section__body iz-pr-week-pay-collapsible__body">
					<IzCard className="iz-pr-week-pay-card !mt-0">
						<div className="iz-pr-week-pay-card__head">
							<div>
								<p className="iz-pr-week-pay-card__title">{title}</p>
								<p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
									{summary.weekLabel}
								</p>
							</div>
							<div className="text-right">
								<p className="iz-tiny iz-muted2">{t.prPortal.verifiedDays}</p>
								<p className="font-sora text-base font-extrabold text-[var(--iz-violet-l)]">
									{summary.verifiedDayCount}/7
								</p>
							</div>
						</div>
						<PrWeeklyPaymentGrid
							summary={summary}
							large
							weekPhase={weekPhase}
							interactive={canDispute || Boolean(onWithdrawDispute && actionPv)}
							onDisputeDay={openDisputeForDay}
							onWithdrawDay={openWithdrawForDay}
							activeDisputeKey={activeDisputeKey}
						/>
						{/* Two independent clauses joined by "·", each whole in the
						    dictionary — not one sentence cut into fragments around a
						    <b>. The emphasis moves onto the whole money clause so the
						    figure still reads as the figure. */}
						<p className="iz-tiny iz-muted2 mt-2 text-center">
							{weekPhase === "open" && !summary.pvReady ? (
								<>
									{fill(t.prPortal.pvWillBeSentOn, {
										day: summary.issueDayLabel,
									})}
									{" · "}
									<b className="text-[var(--iz-gold)]">
										{fill(t.prPortal.runningTotal, {
											total: formatRM(weekTotalRm(summary)),
										})}
									</b>
								</>
							) : (
								<>
									{t.prPortal.pvIssuedEverySunday}
									{" · "}
									<b className="text-[var(--iz-gold)]">
										{fill(t.prPortal.weekTotal, {
											total: formatRM(weekTotalRm(summary)),
										})}
									</b>
								</>
							)}
						</p>
						{actionPv && needsReview && !hasOpenDisputes && (
							<button
								type="button"
								className="iz-btn iz-btn-primary iz-btn-sm mt-2 w-full"
								onClick={() => onOpenPv?.(actionPv.id)}
							>
								{fill(t.prPortal.reviewAndSignTotal, {
									total: formatRM(weekTotalRm(summary)),
								})}
							</button>
						)}
					</IzCard>
				</div>
			)}

			<PrPvDisputeSheet
				open={disputeSheetOpen}
				onClose={closeDisputeSheet}
				mode={disputeMode}
				targets={disputeTargets}
				reason={disputeReason}
				onReasonChange={setDisputeReason}
				photos={disputePhotos}
				onPhotosChange={setDisputePhotos}
				onSubmit={submitDispute}
				onWithdraw={submitWithdraw}
			/>
		</section>
	);
}
