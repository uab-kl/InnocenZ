import { formatRM } from "@agency-portal/components/iz/ui";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function formatCompactRm(value: number): string {
	if (value >= 1000) {
		const k = value / 1000;
		const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
		return `RM ${rounded}k`;
	}
	return formatRM(value);
}

export function OutletReportTopPrCard({
	rank,
	name,
	agency,
	earned,
	topEarned,
}: {
	rank: number;
	name: string;
	agency: string;
	earned: number;
	topEarned: number;
}) {
	const pct = topEarned > 0 ? Math.round((earned / topEarned) * 100) : 0;
	const { t } = usePortalLocale();
	const pctLabel = fill(t.reports.pctOfTopEarner, {
		pct: rank === 1 ? 100 : pct,
	});

	return (
		<article className="iz-outlet-report-pr-card">
			<div className="iz-outlet-report-pr-card__head">
				<div className="iz-outlet-report-pr-card__identity">
					<span
						className="iz-outlet-report-pr-rank"
						aria-label={fill(t.reports.rankLabel, { rank })}
					>
						{rank}
					</span>
					<div className="min-w-0">
						<p className="iz-outlet-report-pr-card__name">{name}</p>
						<p className="iz-outlet-report-pr-card__agency">{agency}</p>
					</div>
				</div>
				<span className="iz-outlet-report-pr-card__earned">
					{formatRM(earned)}
				</span>
			</div>
			<div className="iz-outlet-report-pr-bar">
				<div className="iz-outlet-report-pr-bar__track">
					<div
						className={cn(
							"iz-outlet-report-pr-bar__fill",
							rank === 1 && "iz-outlet-report-pr-bar__fill--top",
						)}
						style={{ width: `${Math.max(pct, rank === 1 ? 100 : 4)}%` }}
					/>
				</div>
				<span className="iz-outlet-report-pr-bar__label">{pctLabel}</span>
			</div>
		</article>
	);
}
