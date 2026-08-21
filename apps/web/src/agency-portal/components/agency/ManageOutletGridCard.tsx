import { OutletLogoTile } from "@agency-portal/components/agency/OutletLogoTile";
import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import type { AgencyOutletSummary } from "@agency-portal/lib/agency-outlet-shifts";
import { cn } from "@agency-portal/lib/utils";
import { Check } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

const OUTLET_THEME_KEYS = ["violet", "cyan", "pink", "amber", "mint"] as const;
type OutletThemeKey = (typeof OUTLET_THEME_KEYS)[number];

function outletThemeKey(outlet: string): OutletThemeKey {
	const idx = OUTLET_NAMES.indexOf(outlet);
	return OUTLET_THEME_KEYS[idx >= 0 ? idx % OUTLET_THEME_KEYS.length : 0];
}

function formatOutletTipRange(wagePerHour: number) {
	const min = Math.round(wagePerHour * 0.08);
	const max = Math.round(wagePerHour * 0.18);
	return `RM ${min}–${max}`;
}

function DemandKpi({
	label,
	demand,
	supplied,
	highlight,
}: {
	label: string;
	demand: number;
	supplied: number;
	highlight?: boolean;
}) {
	const hasData = demand > 0 || supplied > 0;

	return (
		<div
			className={cn(
				"iz-outlet-manage-card__kpi-box",
				highlight && "iz-outlet-manage-card__kpi-box--today",
			)}
		>
			<span className="iz-outlet-manage-card__kpi-label">{label}</span>
			{hasData ? (
				<p className="iz-outlet-manage-card__kpi-value">
					<span>{demand}</span>
					<span className="iz-outlet-manage-card__kpi-sep">/</span>
					<span className="iz-outlet-manage-card__kpi-supplied">
						{supplied}
					</span>
				</p>
			) : (
				<p className="iz-outlet-manage-card__kpi-empty">—</p>
			)}
		</div>
	);
}

type ManageOutletGridCardProps = {
	summary: AgencyOutletSummary;
	selectMode: boolean;
	picked: boolean;
	onActivate: () => void;
	/**
	 * The venue's `logo_image`, looked up by the page — the summary is built from
	 * shifts and carries no outlet id or logo of its own. Absent means the map pin,
	 * which is the right answer for a venue that has uploaded no mark.
	 */
	logo?: string | null;
	/**
	 * This partnership is OVER, and the venue is only still here because it has
	 * shifts left to finish (0127).
	 *
	 * Looked up by the page for the same reason as `logo`: the summary is built
	 * from shifts and carries no outlet id. Without it the grid shows a former
	 * partner exactly like a current one — the agency keeps the access it needs
	 * to work the remaining shifts, with nothing on screen saying the
	 * relationship has ended.
	 */
	ended?: boolean;
};

export function ManageOutletGridCard({
	summary,
	selectMode,
	picked,
	onActivate,
	logo,
	ended,
}: ManageOutletGridCardProps) {
	const { t } = usePortalLocale();
	const theme = outletThemeKey(summary.outlet);
	const wage = summary.rule.wagePerHour.toLocaleString("en-MY");

	// A real <button>, not an <article role="button">: the whole card is one
	// activation target, and the native element brings the keyboard handling the
	// hand-rolled onKeyDown was reproducing (Enter and Space both fire click on a
	// button). The card class already carries the flex layout, left alignment and
	// pointer cursor a button needs.
	return (
		<button
			type="button"
			className={cn(
				"iz-outlet-manage-card w-full",
				`iz-outlet-manage-card--${theme}`,
				picked && "iz-outlet-manage-card--picked",
			)}
			onClick={onActivate}
		>
			{selectMode && (
				<div
					className={cn(
						"iz-outlet-manage-card__check",
						picked && "iz-outlet-manage-card__check--on",
					)}
					aria-hidden
				>
					{picked && <Check className="h-3 w-3" strokeWidth={3} />}
				</div>
			)}

			<div className="iz-outlet-manage-card__head">
				<div className="iz-outlet-manage-card__identity">
					<OutletLogoTile logo={logo} className="iz-outlet-manage-card__icon" />
					<div className="min-w-0">
						<p className="iz-outlet-manage-card__name">{summary.outlet}</p>
						{/* Under the name, not over the card: the venue is still workable
						    and the shifts on it are still yours to fill, so this states a
						    fact rather than greying out work that must still be done.
						    Grey, never red — the partnership ran its course, nothing
						    failed. */}
						{ended && (
							<p className="iz-tiny iz-muted2 mt-0.5">
								{t.manageOutlet.endedFinishing}
							</p>
						)}
						<p className="iz-outlet-manage-card__rate">
							{fill(t.manageOutlet.perShift, { wage })}
						</p>
					</div>
				</div>
				<span className="iz-outlet-manage-card__events">
					{fill(
						summary.openShiftCount === 1
							? t.manageOutlet.eventCountOne
							: t.manageOutlet.eventCountMany,
						{ n: summary.openShiftCount },
					)}
				</span>
			</div>

			<div className="iz-outlet-manage-card__kpi">
				<DemandKpi
					label={t.manageOutlet.today}
					demand={summary.todayDemand}
					supplied={summary.todaySupplied}
					highlight
				/>
				<DemandKpi
					label={t.manageOutlet.future}
					demand={summary.futureDemand}
					supplied={summary.futureSupplied}
				/>
			</div>

			<div className="iz-outlet-manage-card__foot">
				<p className="iz-outlet-manage-card__meta">
					{fill(t.manageOutlet.drinksAndTips, {
						pct: summary.rule.drinkPct,
						range: formatOutletTipRange(summary.rule.wagePerHour),
					})}
				</p>
				<span className="iz-outlet-manage-card__legend">
					{t.manageOutlet.demandSupplied}
				</span>
			</div>
		</button>
	);
}
