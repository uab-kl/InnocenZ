import { formatRM } from "@agency-portal/components/iz/ui";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * "RM 12k" / "−RM 1.5k" — a loss night compacts like a good one, with the
 * sign in front of the currency as `formatRM` prints it.
 */
export function formatCompactRm(value: number): string {
	if (Math.abs(value) >= 1000) {
		const k = Math.abs(value) / 1000;
		const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
		return `${value < 0 ? "−" : ""}RM ${rounded}k`;
	}
	return formatRM(value);
}

/**
 * A share of floor sales as a whole percent, or NULL when there were no sales
 * to share — a percentage of nothing has no value. Velvet 23 has wages on
 * every night and no floor sales at all, and the screen printed "PR spend 0%"
 * beside RM 5,075 of PR spend. Callers render null as no percentage.
 */
export function pctOfSales(part: number, sales: number): number | null {
	return sales > 0 ? Math.round((part / sales) * 100) : null;
}

/** A P&L bar segment's width: its share of sales, held to 0–100%. */
export function pnlBarPct(part: number, sales: number): number {
	if (!(sales > 0)) return 0;
	return Math.min(100, Math.max(0, (part / sales) * 100));
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
					{/* The badge is a bare <span> (role=generic), and a generic element
					    takes no accessible name — the aria-label here was read by
					    nothing. The same words now ride as real text, hidden from
					    sight only, with the bare numeral hidden from the reader so it
					    is not announced twice. */}
					<span className="iz-outlet-report-pr-rank">
						<span className="sr-only">
							{fill(t.reports.rankLabel, { rank })}
						</span>
						<span aria-hidden="true">{rank}</span>
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
