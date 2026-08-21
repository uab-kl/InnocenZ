import { formatRM } from "@agency-portal/components/iz/ui";
import { LiveEarningsLabel } from "@agency-portal/components/outlet/outlet-live-sales-ui";
import type { OutletPrLiveEarningsBreakdown } from "@agency-portal/lib/outlet-financial-sync";
import { roundRm } from "@agency-portal/lib/outlet-financial-sync";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";

function FormulaCell({
	baseLabel,
	pct,
	resultRm,
}: {
	baseLabel: string;
	pct: number;
	resultRm: number;
}) {
	return (
		<td className="iz-outlet-live-earnings-table__formula">
			<span className="iz-outlet-live-earnings-table__base">{baseLabel}</span>
			<span className="iz-outlet-live-earnings-table__op"> × {pct}% = </span>
			<span className="iz-outlet-live-earnings-table__result">
				{formatRM(resultRm)}
			</span>
		</td>
	);
}

function EarningsRow({
	row,
	onClick,
}: {
	row: OutletPrLiveEarningsBreakdown;
	onClick?: () => void;
}) {
	return (
		<tr
			className={cn(
				onClick && "iz-outlet-live-earnings-table__row--interactive",
			)}
			onClick={onClick}
			onKeyDown={
				onClick
					? (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onClick();
							}
						}
					: undefined
			}
			tabIndex={onClick ? 0 : undefined}
			role={onClick ? "button" : undefined}
		>
			<td className="iz-outlet-live-earnings-table__name">{row.prName}</td>
			<td className="iz-outlet-live-earnings-table__id">{row.prId}</td>
			<td className="iz-outlet-live-earnings-table__wage">
				{formatRM(row.dailyWagesRm)}
			</td>
			<FormulaCell
				baseLabel={formatRM(row.hhDrinkSalesRm)}
				pct={row.hhDrinkPct}
				resultRm={row.hhCommissionRm}
			/>
			<FormulaCell
				baseLabel={formatRM(row.normalDrinkSalesRm)}
				pct={row.normalDrinkPct}
				resultRm={row.normalCommissionRm}
			/>
			<td className="iz-outlet-live-earnings-table__wage">
				{formatRM(row.tipSalesRm)}
			</td>
			<td className="iz-outlet-live-earnings-table__formula">
				<span className="iz-outlet-live-earnings-table__base">
					{row.otHours}
				</span>
				<span className="iz-outlet-live-earnings-table__op">
					{" "}
					× {formatRM(row.otRmPerHour)} ={" "}
				</span>
				<span className="iz-outlet-live-earnings-table__result">
					{formatRM(row.otPayRm)}
				</span>
			</td>
			<td className="iz-outlet-live-earnings-table__total">
				{formatRM(row.totalEarnRm)}
			</td>
		</tr>
	);
}

export function OutletPrLiveSalesFloorTable({
	rows,
	onRowClick,
	className,
}: {
	rows: OutletPrLiveEarningsBreakdown[];
	onRowClick?: (prId: string) => void;
	className?: string;
}) {
	const { t } = usePortalLocale();
	const totals = rows.reduce(
		(acc, row) => ({
			wages: acc.wages + row.dailyWagesRm,
			hh: acc.hh + row.hhCommissionRm,
			normal: acc.normal + row.normalCommissionRm,
			tips: acc.tips + row.tipSalesRm,
			ot: acc.ot + row.otPayRm,
			earn: acc.earn + row.totalEarnRm,
			drinkSales: acc.drinkSales + row.hhDrinkSalesRm + row.normalDrinkSalesRm,
			tipSales: acc.tipSales + row.tipSalesRm,
		}),
		{
			wages: 0,
			hh: 0,
			normal: 0,
			tips: 0,
			ot: 0,
			earn: 0,
			drinkSales: 0,
			tipSales: 0,
		},
	);

	return (
		<div className={cn("iz-outlet-live-earnings-table-wrap", className)}>
			<table className="iz-outlet-live-earnings-table">
				<thead>
					<tr>
						<th>
							<LiveEarningsLabel label={t.today.colPrName} />
						</th>
						<th>
							<LiveEarningsLabel label={t.today.colPrId} />
						</th>
						<th>
							<LiveEarningsLabel label={t.today.colDailyWages} />
						</th>
						<th>
							<LiveEarningsLabel label="HH" />
						</th>
						<th>
							<LiveEarningsLabel label={t.today.colNormal} />
						</th>
						<th>
							<LiveEarningsLabel label={t.reports.colTips} />
						</th>
						<th>
							<LiveEarningsLabel label="OT" />
						</th>
						<th>
							<LiveEarningsLabel label={t.today.colTotalEarn} />
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td colSpan={8} className="iz-outlet-live-earnings-table__empty">
								{t.today.noFloorSalesTonight}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<EarningsRow
								key={row.prId}
								row={row}
								onClick={onRowClick ? () => onRowClick(row.prId) : undefined}
							/>
						))
					)}
				</tbody>
				{rows.length > 0 && (
					<tfoot>
						<tr className="iz-outlet-live-earnings-table__foot">
							<th scope="row" colSpan={2}>
								<LiveEarningsLabel label={t.today.tonightTotal} />
							</th>
							<td>{formatRM(roundRm(totals.wages))}</td>
							<td>{formatRM(roundRm(totals.hh))}</td>
							<td>{formatRM(roundRm(totals.normal))}</td>
							<td>{formatRM(roundRm(totals.tips))}</td>
							<td>{formatRM(roundRm(totals.ot))}</td>
							<td className="iz-outlet-live-earnings-table__total">
								{formatRM(roundRm(totals.earn))}
							</td>
						</tr>
						<tr className="iz-outlet-live-earnings-table__foot-meta">
							<td colSpan={8}>
								Floor drinks {formatRM(roundRm(totals.drinkSales))} · tips{" "}
								{formatRM(roundRm(totals.tipSales))}
							</td>
						</tr>
					</tfoot>
				)}
			</table>
		</div>
	);
}
