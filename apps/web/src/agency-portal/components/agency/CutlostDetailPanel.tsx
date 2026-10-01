import { IzPill } from "@agency-portal/components/iz/ui";
import {
	cutlostLossChipRm,
	cutlostRequestDetail,
	cutlostRequestedAtLabel,
	cutlostRequestTitle,
	cutlostShiftDateLabel,
	type PendingCutlostRequest,
} from "@agency-portal/lib/outlet-cutlost-requests";
import {
	Clock,
	Loader2,
	Sparkles,
	TrendingDown,
	UserMinus,
} from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * One cut-loss request on the agency Approvals page — the decision pane.
 *
 * Moved out of `routes/agency/pending.tsx` (28 Sep 2026 audit) so the three
 * things that were wrong with it could be pinned by a test: Approve stayed
 * clickable while the decision was in flight, the request time printed as a raw
 * UTC ISO string, and every live request wore a "Cutlost RM 0" chip for a
 * figure the server does not hold. The decline reason sheet stays with the
 * page, which opens it through `onDecline`.
 */
export function CutlostDetailPanel({
	req,
	canDecide,
	busy,
	onApprove,
	onDecline,
}: {
	req: PendingCutlostRequest;
	/** `approvals:update`. False for the Director, who reads the queue only. */
	canDecide: boolean;
	/**
	 * A decision on this request is in flight. Both buttons wait for it:
	 * approving RELEASES people and seals a pro-rated wage on every named PR,
	 * and a second press used to fire a second decision straight behind it.
	 */
	busy: boolean;
	onApprove: () => void;
	onDecline: () => void;
}) {
	const { t, locale } = usePortalLocale();
	const localeTag = dateLocaleTag(locale);
	const lossRm = cutlostLossChipRm(req);
	const Icon =
		req.kind === "best_effort"
			? Sparkles
			: req.kind === "release_prs"
				? UserMinus
				: TrendingDown;

	return (
		<>
			<div className="iz-approvals-detail-head">
				<div className="iz-approvals-detail-profile">
					<span className="iz-approvals-cutlost-icon">
						<Icon className="h-5 w-5" />
					</span>
					<div className="min-w-0">
						<h2 className="iz-approvals-detail-name">{req.outletName}</h2>
						<p className="iz-approvals-detail-meta">{req.shiftEvent}</p>
						<p className="iz-approvals-detail-meta mt-0.5">
							<Clock className="mr-1 inline h-3 w-3" />
							{fill(t.agencyPending.requestedAt, {
								date: cutlostRequestedAtLabel(req, localeTag),
							})}
						</p>
					</div>
				</div>
				{/* Approving RELEASES people and seals a pro-rated wage, so this pair
				    is the sharpest write on the page — a view-only lane sees the
				    request in full and gets neither button. */}
				{canDecide && (
					<div className="iz-approvals-detail-actions">
						<button
							type="button"
							className="iz-btn iz-btn-primary !py-2 !text-xs"
							disabled={busy}
							aria-busy={busy || undefined}
							onClick={() => {
								if (!busy) onApprove();
							}}
						>
							{busy && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
							{t.common.approve}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft !py-2 !text-xs"
							disabled={busy}
							onClick={() => {
								if (!busy) onDecline();
							}}
						>
							{t.common.decline}
						</button>
					</div>
				)}
			</div>

			<div className="iz-approvals-cutlost-summary">
				<Icon className="h-4 w-4 shrink-0 text-[var(--iz-gold-l)]" />
				<div className="min-w-0">
					<p className="iz-heading text-sm font-bold text-[var(--iz-txt)]">
						{cutlostRequestTitle(req)}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{cutlostRequestDetail(req)}
					</p>
				</div>
			</div>

			<div className="iz-approvals-info-chips mt-3">
				<IzPill variant="violet">
					{cutlostShiftDateLabel(req.dateLabel, localeTag)}
				</IzPill>
				<IzPill variant="violet">{req.shiftLabel}</IzPill>
				{req.model === "best_effort" && (
					<IzPill variant="violet">{t.approvals.bestEffort}</IzPill>
				)}
				{/* "RM" and the grouped number stay out of the dictionary — currency
				    has one source of truth, and a key that baked it in would be a
				    second one. Only the word in front of the amount is translated.
				    Left out entirely when there is no figure: a live request has
				    none, and "Cutlost RM 0" reads as a loss of nothing. */}
				{lossRm !== null && (
					<IzPill variant="red">
						{t.approvals.cutlost} RM {lossRm.toLocaleString("en-MY")}
					</IzPill>
				)}
				<IzPill variant="green">
					{t.agencyPending.saves} ~RM{" "}
					{Math.round(req.estimatedSavings).toLocaleString("en-MY")}
				</IzPill>
			</div>

			{req.releasedPrNames?.length ? (
				<div className="iz-approvals-info-card mt-3">
					<h3 className="iz-approvals-info-title">{t.approvals.prsAffected}</h3>
					<p className="iz-tiny iz-muted">{req.releasedPrNames.join(", ")}</p>
					<p className="iz-tiny iz-muted2 mt-2">
						{t.agencyPending.releaseOnApprove}
					</p>
				</div>
			) : null}

			{req.rationale?.length ? (
				<div className="iz-approvals-info-card mt-3">
					<h3 className="iz-approvals-info-title">{t.approvals.rationale}</h3>
					<ul className="iz-approvals-rationale">
						{req.rationale.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			) : null}
		</>
	);
}
