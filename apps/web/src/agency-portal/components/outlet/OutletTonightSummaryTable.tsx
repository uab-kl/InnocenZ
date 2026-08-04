import { formatRM } from "@agency-portal/components/iz/ui";
import { LiveEarningsLabel } from "@agency-portal/components/outlet/outlet-live-sales-ui";
import {
	effectiveShiftDrinkMenu,
	formatOutletShiftMetricAmount,
	type OutletDrinkPrice,
	typicalDrinkPrice,
} from "@agency-portal/lib/outlet-demo";
import type { OutletTonightFloorTotals } from "@agency-portal/lib/outlet-financial-sync";
import { outletCan } from "@agency-portal/lib/outlet-rbac";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";

export function OutletTonightSummaryTable({
	floorTotals,
	outletSubRole,
	drinkMenu = [],
	shift,
	variant = "standalone",
}: {
	floorTotals: OutletTonightFloorTotals;
	outletSubRole: Parameters<typeof outletCan>[0];
	drinkMenu?: OutletDrinkPrice[];
	shift?: ShiftRequest;
	/** standalone = legacy; embedded = inside expanded live sales; collapsed = live sales header when closed */
	variant?: "standalone" | "embedded" | "collapsed";
}) {
	const grandTotal = floorTotals.totalSalesRm;
	const canViewReport =
		outletCan(outletSubRole, "viewBilling") ||
		outletCan(outletSubRole, "viewSalesDashboard");
	const menu = shift ? effectiveShiftDrinkMenu(shift, drinkMenu) : drinkMenu;
	const typicalPerDrink = typicalDrinkPrice(menu);
	const drinksLabel =
		floorTotals.totalDrinksRm > 0 && floorTotals.drinkUnits > 0
			? `${floorTotals.drinkUnits} · ${formatRM(floorTotals.totalDrinksRm)}`
			: formatRM(floorTotals.totalDrinksRm);
	const drinksHint =
		floorTotals.drinkUnits > 0 && typicalPerDrink > 0
			? `~${formatRM(typicalPerDrink)} avg`
			: null;

	return (
		<div
			className={cn(
				"iz-outlet-tonight-summary-table-wrap",
				variant === "embedded" &&
					"iz-outlet-tonight-summary-table-wrap--embedded",
				variant === "collapsed" &&
					"iz-outlet-tonight-summary-table-wrap--collapsed",
			)}
		>
			<table
				className="iz-outlet-tonight-summary-table"
				aria-label="Tonight floor summary"
			>
				<thead>
					<tr>
						<th
							scope="col"
							className="iz-outlet-tonight-summary-table__today-col"
						/>
						<th scope="col">
							<LiveEarningsLabel label="Total Sales Report" />
						</th>
						<th scope="col">
							<LiveEarningsLabel label="Total Drinks" />
						</th>
						<th scope="col">
							<LiveEarningsLabel label="Total Tips" />
						</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row" className="iz-outlet-tonight-summary-table__today">
							Today:
						</th>
						<td>
							{canViewReport ? (
								<Link
									to="/outlet/billing"
									className="iz-outlet-tonight-summary-table__link"
								>
									{formatOutletShiftMetricAmount(grandTotal)}
								</Link>
							) : (
								formatOutletShiftMetricAmount(grandTotal)
							)}
						</td>
						<td>
							<span className="iz-outlet-tonight-summary-table__drinks">
								{drinksLabel}
								{drinksHint ? (
									<span className="iz-outlet-tonight-summary-table__drinks-hint">
										{drinksHint}
									</span>
								) : null}
							</span>
						</td>
						<td>{formatRM(floorTotals.totalTipsRm)}</td>
					</tr>
				</tbody>
			</table>
			{!variant || variant === "standalone" ? (
				<p className="iz-outlet-tonight-summary-table__hint">
					Totals from tonight&apos;s PR floor sales
				</p>
			) : null}
			{variant === "embedded" && (
				<p className="iz-outlet-tonight-summary-table__hint">
					Breakdown by PR below
				</p>
			)}
		</div>
	);
}
