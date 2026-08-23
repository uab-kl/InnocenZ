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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { languageListLabel } from "@/lib/portal-i18n/language-label";

/** Languages shown on the card before collapsing the rest into "+N more". */
const MAX_CARD_LANGUAGES = 2;

type ManagePrGridCardProps = {
	pr: AgencyManagedPR;
	active: boolean;
	/**
	 * TODAY, right now: on-duty / scheduled / unavailable — or null for the
	 * plain active/inactive pill. Rival duty arrives as bare windows only,
	 * so this can say WHAT she is doing but never WHERE.
	 */
	liveStatus?: "on-duty" | "scheduled" | "unavailable" | null;
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
	liveStatus,
	flags,
	averageRating,
	selectMode,
	picked,
	onActivate,
}: ManagePrGridCardProps) {
	const { t } = usePortalLocale();
	const preview = toComcardPreview(pr);
	// Two languages fit; the rest were silently dropped, so a PR who speaks five
	// looked identical to one who speaks two. Say how many are hidden — the full
	// list is on their profile. The rule now lives in `splitCardLanguages` so the
	// roster popover and the comcard card cannot each invent their own cap.
	const cardLangs = splitCardLanguages(pr, MAX_CARD_LANGUAGES);
	const hiddenLangCount = cardLangs.hidden;
	const metaLine = [languageListLabel(cardLangs.shown, t), pr.place]
		.filter(Boolean)
		.join(" · ");
	const paid = formatOutletHistRm(pr.totalPaid ?? 0);

	return (
		// A real <button>, not an <article role="button">: the browser then gives us
		// the focus ring, the Enter/Space activation and the announced role for free,
		// so the hand-rolled tabIndex + onKeyDown pair could go. `items-stretch`
		// restores the flex default the UA button stylesheet overrides to
		// `flex-start`, which would otherwise shrink the card body to its text width.
		<button
			type="button"
			className={cn(
				"iz-pr-manage-card items-stretch",
				picked && "iz-pr-manage-card--picked",
				!active && "iz-pr-manage-card--inactive",
				flags.suspendStreak && active && "iz-pr-manage-card--warn-border",
			)}
			onClick={onActivate}
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
					variant={
						liveStatus === "on-duty"
							? "gold"
							: liveStatus === "scheduled"
								? "amber"
								: liveStatus === "unavailable"
									? "ink"
									: active
										? "green"
										: "ink"
					}
					className="iz-pr-manage-card__status"
				>
					{liveStatus === "on-duty"
						? t.roster.onDuty
						: liveStatus === "scheduled"
							? t.roster.scheduled
							: liveStatus === "unavailable"
								? t.roster.unavailable
								: active
									? t.managePr.active
									: t.managePr.inactive}
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
							title={languageListLabel(cardLangs.all, t)}
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
								{t.managePr.flagSuspended}
							</IzPill>
						)}
						{flags.warnLowAvg && active && (
							<IzPill variant="amber" className="iz-pr-manage-card__flag">
								{t.managePr.flagWarn}
							</IzPill>
						)}
						{flags.suspendStreak && active && (
							<IzPill variant="red" className="iz-pr-manage-card__flag">
								{t.managePr.flagSuspend}
							</IzPill>
						)}
						{flags.tiedUnderOneYear && (
							<IzPill variant="violet" className="iz-pr-manage-card__flag">
								{t.managePr.flagTied}
							</IzPill>
						)}
					</div>
				)}

				<div className="iz-pr-manage-card__metrics">
					<div className="iz-pr-manage-card__metric">
						<span className="iz-pr-manage-card__metric-label">
							{t.managePr.metricPaid}
						</span>
						<span className="iz-pr-manage-card__metric-value iz-pr-manage-card__metric-value--gold">
							{paid}
						</span>
					</div>
					<div className="iz-pr-manage-card__metric">
						<span className="iz-pr-manage-card__metric-label">
							{t.managePr.metricAtt}
						</span>
						{/* Null = no concluded shift yet, which is NOT 0%. Printing 0
						    here told the agency a PR had missed every shift on a
						    roster they had never been scheduled on. */}
						<span
							className="iz-pr-manage-card__metric-value"
							title={
								pr.attendancePct === null
									? t.managePr.noConcludedShifts
									: fill(t.managePr.keptMissed, {
											kept: pr.checkIns,
											missed: pr.noShows,
										})
							}
						>
							{pr.attendancePct === null ? "—" : `${pr.attendancePct}%`}
						</span>
					</div>
					<div className="iz-pr-manage-card__metric">
						<span className="iz-pr-manage-card__metric-label">
							{t.managePr.metricKpi}
						</span>
						<span className="iz-pr-manage-card__metric-value">
							{pr.kpiScore ?? "—"}
						</span>
					</div>
				</div>
			</div>
		</button>
	);
}
