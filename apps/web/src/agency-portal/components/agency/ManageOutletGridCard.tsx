import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import type { AgencyOutletSummary } from "@agency-portal/lib/agency-outlet-shifts";
import { cn } from "@agency-portal/lib/utils";
import { Check, MapPin } from "lucide-react";

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
};

export function ManageOutletGridCard({
	summary,
	selectMode,
	picked,
	onActivate,
}: ManageOutletGridCardProps) {
	const theme = outletThemeKey(summary.outlet);
	const wage = summary.rule.wagePerHour.toLocaleString("en-MY");

	return (
		<article
			role="button"
			tabIndex={0}
			className={cn(
				"iz-outlet-manage-card",
				`iz-outlet-manage-card--${theme}`,
				picked && "iz-outlet-manage-card--picked",
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
					<div className="iz-outlet-manage-card__icon" aria-hidden>
						<MapPin className="h-6 w-6" />
					</div>
					<div className="min-w-0">
						<p className="iz-outlet-manage-card__name">{summary.outlet}</p>
						<p className="iz-outlet-manage-card__rate">RM {wage}/shift</p>
					</div>
				</div>
				<span className="iz-outlet-manage-card__events">
					{summary.openShiftCount} Event
					{summary.openShiftCount !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="iz-outlet-manage-card__kpi">
				<DemandKpi
					label="Today"
					demand={summary.todayDemand}
					supplied={summary.todaySupplied}
					highlight
				/>
				<DemandKpi
					label="Future"
					demand={summary.futureDemand}
					supplied={summary.futureSupplied}
				/>
			</div>

			<div className="iz-outlet-manage-card__foot">
				<p className="iz-outlet-manage-card__meta">
					Drinks {summary.rule.drinkPct}% · Tips{" "}
					{formatOutletTipRange(summary.rule.wagePerHour)}
				</p>
				<span className="iz-outlet-manage-card__legend">Demand / Supplied</span>
			</div>
		</article>
	);
}
