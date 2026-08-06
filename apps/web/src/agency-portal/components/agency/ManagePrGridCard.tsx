import { ComcardGridVisual } from "@agency-portal/components/agency/Comcard3dPreview";
import { toComcardPreview } from "@agency-portal/components/agency/PrComcardIdentity";
import { IzPill } from "@agency-portal/components/iz/ui";
import { formatOutletHistRm } from "@agency-portal/components/outlet/outlet-history-ui";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { splitCardLanguages } from "@agency-portal/lib/agency-demo";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import type { getAgencyPrFlags } from "@agency-portal/lib/agency-pr-flags";
import { cn } from "@agency-portal/lib/utils";
import { Check, Star } from "lucide-react";

/** Languages shown on the card before collapsing the rest into "+N more". */
const MAX_CARD_LANGUAGES = 2;

type ManagePrGridCardProps = {
	pr: AgencyManagedPR;
	active: boolean;
	flags: ReturnType<typeof getAgencyPrFlags>;
	/**
	 * The PR's real mean rating, or null when they have never been rated.
	 * NOT `pr.rating` — that is a 0 placeholder on every backend PR, and printing
	 * it showed "0.0" on a card whose owner had real stars.
	 */
	averageRating: number | null;
	selectMode: boolean;
	picked: boolean;
	onActivate: () => void;
};

export function ManagePrGridCard({
	pr,
	active,
	flags,
	averageRating,
	selectMode,
	picked,
	onActivate,
}: ManagePrGridCardProps) {
	const preview = toComcardPreview(pr);
	// Two languages fit; the rest were silently dropped, so a PR who speaks five
	// looked identical to one who speaks two. Say how many are hidden — the full
	// list is on their profile. The rule now lives in `splitCardLanguages` so the
	// roster popover and the comcard card cannot each invent their own cap.
	const cardLangs = splitCardLanguages(pr, MAX_CARD_LANGUAGES);
	const hiddenLangCount = cardLangs.hidden;
	const metaLine = [cardLangs.shown.join(" · "), pr.place]
		.filter(Boolean)
		.join(" · ");
	const paid = formatOutletHistRm(pr.totalPaid ?? 0);

	return (
		<article
			role="button"
			tabIndex={0}
			className={cn(
				"iz-pr-manage-card",
				picked && "iz-pr-manage-card--picked",
				!active && "iz-pr-manage-card--inactive",
				flags.suspendStreak && active && "iz-pr-manage-card--warn-border",
			)}
			onClick={onActivate}
			onKeyDown={(e) => {
				if (e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				onActivate();
			}}
		>
			{selectMode && (
				<div
					className={cn(
						"iz-pr-manage-card__check",
						picked && "iz-pr-manage-card__check--on",
					)}
					aria-hidden
				>
					{picked && <Check className="h-3 w-3" strokeWidth={3} />}
				</div>
			)}

			<div className="iz-pr-manage-card__visual">
				<ComcardGridVisual
					pr={preview}
					className="iz-pr-manage-card__comcard"
				/>
				<IzPill
					variant={active ? "green" : "ink"}
					className="iz-pr-manage-card__status"
				>
					{active ? "Active" : "Inactive"}
				</IzPill>
			</div>

			<div className="iz-pr-manage-card__body">
				<div className="iz-pr-manage-card__name-row">
					{/* "(Vicky) Victoria Tan Mei Lin" — the ONE payee formatter, so the
					    roster card names a PR exactly as the voucher and dispute rows do.
					    It collapses to a single name when the account carries only one. */}
					<p className="iz-pr-manage-card__name">
						{formatPayeeLabel(pr.name, pr.icName)}
					</p>
					{averageRating !== null && (
						<span className="iz-pr-manage-card__rating">
							<Star className="iz-pr-manage-card__rating-star" aria-hidden />
							{averageRating.toFixed(1)}
						</span>
					)}
				</div>

				<div className="iz-pr-manage-card__tier-row">
					{pr.trainingLevel && (
						<IzPill variant="violet" className="iz-pr-manage-card__tier">
							{pr.trainingLevel}
						</IzPill>
					)}
					{metaLine && <p className="iz-pr-manage-card__meta">{metaLine}</p>}
					{hiddenLangCount > 0 && (
						<span
							className="iz-pr-manage-card__more-langs"
							title={cardLangs.all.join(" · ")}
						>
							+{hiddenLangCount}
						</span>
					)}
				</div>

				{(flags.warnLowAvg ||
					flags.suspendStreak ||
					flags.tiedUnderOneYear ||
					!active) && (
					<div className="iz-pr-manage-card__flags">
						{!active && (
							<IzPill variant="ink" className="iz-pr-manage-card__flag">
								Suspended
							</IzPill>
						)}
						{flags.warnLowAvg && active && (
							<IzPill variant="amber" className="iz-pr-manage-card__flag">
								Warn
							</IzPill>
						)}
						{flags.suspendStreak && active && (
							<IzPill variant="red" className="iz-pr-manage-card__flag">
								Suspend
							</IzPill>
						)}
						{flags.tiedUnderOneYear && (
							<IzPill variant="violet" className="iz-pr-manage-card__flag">
								Tied
							</IzPill>
						)}
					</div>
				)}

				<div className="iz-pr-manage-card__metrics">
					<div className="iz-pr-manage-card__metric">
						<span className="iz-pr-manage-card__metric-label">Paid</span>
						<span className="iz-pr-manage-card__metric-value iz-pr-manage-card__metric-value--gold">
							{paid}
						</span>
					</div>
					<div className="iz-pr-manage-card__metric">
						<span className="iz-pr-manage-card__metric-label">Att.</span>
						<span className="iz-pr-manage-card__metric-value">
							{pr.attendancePct ?? 0}%
						</span>
					</div>
					<div className="iz-pr-manage-card__metric">
						<span className="iz-pr-manage-card__metric-label">KPI</span>
						<span className="iz-pr-manage-card__metric-value">
							{pr.kpiScore ?? "—"}
						</span>
					</div>
				</div>
			</div>
		</article>
	);
}
