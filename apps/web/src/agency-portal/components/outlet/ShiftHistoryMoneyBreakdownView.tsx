import { formatRM } from "@agency-portal/components/iz/ui";
import type { ShiftHistoryMoneyBreakdown } from "@agency-portal/lib/shift-history-amounts";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type HistoryMoneyKind = "received" | "payout";

type BreakdownLine = { label: string; value: number; hint?: string };

function receivedLines(
	b: ShiftHistoryMoneyBreakdown,
	t: PortalTranslations,
): BreakdownLine[] {
	return [
		{
			label: t.today.drinkSales,
			value: b.drinkSalesRm,
			hint:
				b.drinkUnits > 0
					? fill(
							b.drinkUnits === 1 ? t.today.unitCountOne : t.today.unitCountMany,
							{ n: b.drinkUnits },
						)
					: undefined,
		},
		{ label: t.reports.colTips, value: b.tipSalesRm },
	];
}

function payoutLines(
	b: ShiftHistoryMoneyBreakdown,
	t: PortalTranslations,
): BreakdownLine[] {
	const lines = [
		{ label: t.today.wages, value: b.wagesRm },
		{ label: "OT", value: b.otRm },
		{ label: t.today.drinkCommission, value: b.drinkCommissionRm },
		{ label: t.today.tipCommission, value: b.tipCommissionRm },
	].filter((l) => l.value > 0);
	return lines.length > 0
		? lines
		: [{ label: t.today.payout, value: b.totalPayout }];
}

/** Line items for one money kind — styled like History shift-log cards. */
export function ShiftHistoryMoneyBreakdownView({
	breakdown,
	kind,
	className,
}: {
	breakdown: ShiftHistoryMoneyBreakdown;
	kind: HistoryMoneyKind;
	className?: string;
}) {
	const { t } = usePortalLocale();
	const lines =
		kind === "received"
			? receivedLines(breakdown, t)
			: payoutLines(breakdown, t);
	const total =
		kind === "received" ? breakdown.totalReceived : breakdown.totalPayout;
	const title =
		kind === "received" ? t.today.receivedBreakdown : t.today.payoutBreakdown;

	return (
		<div
			className={cn(
				"iz-hist-money-breakdown",
				`iz-hist-money-breakdown--${kind}`,
				className,
			)}
		>
			<div className="iz-hist-money-breakdown__card-head">
				<div>
					<p className="iz-hist-money-breakdown__card-title">{title}</p>
					<p className="iz-hist-money-breakdown__card-sub">
						{lines.length} line{lines.length !== 1 ? "s" : ""}
					</p>
				</div>
				<div className="iz-hist-money-breakdown__card-total-wrap">
					<p className="iz-hist-money-breakdown__card-total">
						{formatRM(total)}
					</p>
					<p className="iz-hist-money-breakdown__card-total-hint">
						{t.today.total}
					</p>
				</div>
			</div>
			<div
				className={cn(
					"iz-hist-money-breakdown__metrics",
					lines.length === 2 && "iz-hist-money-breakdown__metrics--pair",
					lines.length >= 3 && "iz-hist-money-breakdown__metrics--multi",
				)}
			>
				{lines.map((line) => (
					<div
						key={line.label}
						className={cn(
							"iz-hist-money-breakdown__metric",
							`iz-hist-money-breakdown__metric--${kind}`,
						)}
					>
						<span className="iz-hist-money-breakdown__metric-label">
							{line.label}
						</span>
						{line.hint ? (
							<span className="iz-hist-money-breakdown__metric-hint">
								{line.hint}
							</span>
						) : null}
						<span className="iz-hist-money-breakdown__metric-value">
							{formatRM(line.value)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
