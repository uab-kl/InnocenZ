import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM, IzCardTitle } from "@agency-portal/components/iz/ui";
import { OutletPrLiveSalesFloorTable } from "@agency-portal/components/outlet/OutletPrLiveSalesFloorTable";
import { LiveEarningsLabel } from "@agency-portal/components/outlet/outlet-live-sales-ui";
import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import {
	type OutletPrLiveEarningsBreakdown,
	type RosterShiftEarningsContext,
	rosterShiftEarningsRows,
	roundRm,
} from "@agency-portal/lib/outlet-financial-sync";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type RosterEarningsSheetKind = "drinks" | "tips" | "payout";

function LiveEarningsFormulaCell({
	baseRm,
	pct,
	resultRm,
}: {
	baseRm: number;
	pct: number;
	resultRm: number;
}) {
	return (
		<td className="iz-outlet-live-earnings-table__formula">
			<span className="iz-outlet-live-earnings-table__base">
				{formatRM(baseRm)}
			</span>
			<span className="iz-outlet-live-earnings-table__op"> × {pct}% = </span>
			<span className="iz-outlet-live-earnings-table__result">
				{formatRM(resultRm)}
			</span>
		</td>
	);
}

function DrinksBreakdownTable({
	rows,
}: {
	rows: OutletPrLiveEarningsBreakdown[];
}) {
	const { t } = usePortalLocale();
	const totals = rows.reduce(
		(acc, row) => ({
			hh: acc.hh + row.hhCommissionRm,
			normal: acc.normal + row.normalCommissionRm,
			drinkSales: acc.drinkSales + row.hhDrinkSalesRm + row.normalDrinkSalesRm,
		}),
		{ hh: 0, normal: 0, drinkSales: 0 },
	);

	return (
		<div className="iz-outlet-live-earnings-table-wrap iz-outlet-live-earnings-table-wrap--sheet">
			<table className="iz-outlet-live-earnings-table iz-outlet-live-earnings-table--sheet">
				<thead>
					<tr>
						{/* "HH" stays as it is in every locale — it is the venue's own
						    shorthand for the happy-hour band, and it heads the same
						    column on the outlet's floor table. */}
						<th>
							<LiveEarningsLabel label="HH" />
						</th>
						<th>
							<LiveEarningsLabel label={t.today.colNormal} />
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td colSpan={2} className="iz-outlet-live-earnings-table__empty">
								{t.agencyRoster.noDrinkSalesThisShift}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr key={row.prId}>
								<LiveEarningsFormulaCell
									baseRm={row.hhDrinkSalesRm}
									pct={row.hhDrinkPct}
									resultRm={row.hhCommissionRm}
								/>
								<LiveEarningsFormulaCell
									baseRm={row.normalDrinkSalesRm}
									pct={row.normalDrinkPct}
									resultRm={row.normalCommissionRm}
								/>
							</tr>
						))
					)}
				</tbody>
				{rows.length > 0 && (
					<tfoot>
						<tr className="iz-outlet-live-earnings-table__foot">
							<td>{formatRM(roundRm(totals.hh))}</td>
							<td>{formatRM(roundRm(totals.normal))}</td>
						</tr>
						<tr className="iz-outlet-live-earnings-table__foot-meta">
							<td colSpan={2}>
								{fill(t.agencyRoster.floorDrinksTotal, {
									amount: formatRM(roundRm(totals.drinkSales)),
								})}
							</td>
						</tr>
					</tfoot>
				)}
			</table>
		</div>
	);
}

function TipsBreakdownTable({
	rows,
}: {
	rows: OutletPrLiveEarningsBreakdown[];
}) {
	const { t } = usePortalLocale();
	const total = roundRm(rows.reduce((sum, row) => sum + row.tipSalesRm, 0));

	return (
		<div className="iz-outlet-live-earnings-table-wrap iz-outlet-live-earnings-table-wrap--sheet">
			<table className="iz-outlet-live-earnings-table iz-outlet-live-earnings-table--sheet">
				<thead>
					<tr>
						<th>
							<LiveEarningsLabel label={t.reports.colTips} />
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td className="iz-outlet-live-earnings-table__empty">
								{t.agencyRoster.noTipsThisShift}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr key={row.prId}>
								<td className="iz-outlet-live-earnings-table__amount">
									{formatRM(row.tipSalesRm)}
								</td>
							</tr>
						))
					)}
				</tbody>
				{rows.length > 0 && (
					<tfoot>
						<tr className="iz-outlet-live-earnings-table__foot">
							<td>{formatRM(total)}</td>
						</tr>
					</tfoot>
				)}
			</table>
		</div>
	);
}

/**
 * RESOLVERS, not dictionary keys.
 *
 * A key is itself a `string`, so storing one here would type-check and then put
 * the key name on screen. A function cannot be rendered by accident. The record
 * KEYS stay the sheet-kind values the caller compares on.
 */
const SHEET_TITLE: Record<
	RosterEarningsSheetKind,
	(t: PortalTranslations) => string
> = {
	drinks: (t) => t.agencyRoster.drinksBreakdown,
	tips: (t) => t.agencyRoster.tipsBreakdown,
	payout: (t) => t.agencyRoster.estPayoutBreakdown,
};

export function RosterShiftEarningsSheets({
	kind,
	anchorSlot,
	earningsContext,
	onClose,
}: {
	kind: RosterEarningsSheetKind | null;
	anchorSlot: AgencyRosterSlot | null;
	earningsContext: RosterShiftEarningsContext;
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	const rows = useMemo(
		() =>
			anchorSlot && kind
				? rosterShiftEarningsRows(anchorSlot, earningsContext)
				: [],
		[anchorSlot, kind, earningsContext],
	);

	if (!kind || !anchorSlot) return null;

	const shiftLabel = `${anchorSlot.outlet} · ${anchorSlot.shift}`;

	return (
		<IzSheet open onClose={onClose} wide liveSales>
			<IzCardTitle>{SHEET_TITLE[kind](t)}</IzCardTitle>
			<p className="iz-sm iz-muted mt-1.5">{shiftLabel}</p>

			{kind === "drinks" && <DrinksBreakdownTable rows={rows} />}
			{kind === "tips" && <TipsBreakdownTable rows={rows} />}
			{kind === "payout" && (
				<OutletPrLiveSalesFloorTable rows={rows} className="mt-4" />
			)}

			<button
				type="button"
				className="iz-btn iz-btn-soft mt-4 w-full"
				onClick={onClose}
			>
				{t.common.close}
			</button>
		</IzSheet>
	);
}
