import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM, IzCardTitle } from "@agency-portal/components/iz/ui";
import { OutletPrLiveSalesFloorTable } from "@agency-portal/components/outlet/OutletPrLiveSalesFloorTable";
import { LiveEarningsLabel } from "@agency-portal/components/outlet/outlet-live-sales-ui";
import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import {
	type OutletPrLiveEarningsBreakdown,
	type RecordedFloorSales,
	type RosterShiftEarningsContext,
	rosterShiftEarningsRows,
	roundRm,
} from "@agency-portal/lib/outlet-financial-sync";
import {
	type RosterWageRow,
	rosterServerWageRows,
	slotHasServerWage,
} from "@agency-portal/lib/roster-payout-breakdown";
import {
	type RosterRecordedSalesRow,
	rosterRecordedSalesRows,
} from "@agency-portal/lib/roster-recorded-sales";
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
 * The Est. payout breakdown on a REAL session: each booking's server wage, the
 * very figures the column shows — see `roster-payout-breakdown.ts` for why the
 * demo table below cannot answer this on a real login.
 */
function ServerWageBreakdownTable({
	rows,
	totalRm,
}: {
	rows: RosterWageRow[];
	totalRm: number;
}) {
	const { t } = usePortalLocale();
	return (
		<>
			<p className="iz-tiny iz-muted mt-3">
				{t.agencyRoster.estPayoutServerHint}
			</p>
			<div className="iz-outlet-live-earnings-table-wrap iz-outlet-live-earnings-table-wrap--sheet">
				<table className="iz-outlet-live-earnings-table iz-outlet-live-earnings-table--sheet">
					<thead>
						<tr>
							<th>
								<LiveEarningsLabel label={t.today.colPrName} />
							</th>
							<th>
								<LiveEarningsLabel label={t.outletDetail.colTier} />
							</th>
							<th>
								<LiveEarningsLabel label={t.today.colDailyWages} />
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 ? (
							<tr>
								<td
									colSpan={3}
									className="iz-outlet-live-earnings-table__empty"
								>
									{t.agencyRoster.noBookingsThisShift}
								</td>
							</tr>
						) : (
							rows.map((row) => (
								<tr key={row.slotId}>
									<td className="iz-outlet-live-earnings-table__name">
										{row.prName}
									</td>
									<td>{row.tier ?? "—"}</td>
									<td className="iz-outlet-live-earnings-table__amount">
										{formatRM(row.wageRm)}
									</td>
								</tr>
							))
						)}
					</tbody>
					{rows.length > 0 && (
						<tfoot>
							<tr className="iz-outlet-live-earnings-table__foot">
								<th scope="row" colSpan={2}>
									<LiveEarningsLabel label={t.agencyRoster.shiftTotal} />
								</th>
								<td>{formatRM(totalRm)}</td>
							</tr>
						</tfoot>
					)}
				</table>
			</div>
		</>
	);
}

/**
 * The Drinks or Tips breakdown on a REAL session: each PR booked on the shift
 * with the floor sales the server recorded — the very figures the column shows.
 * No happy-hour split and no commission %: the recorded row carries no receipt
 * times, and the PR's commission is sealed on their voucher, not re-priced here
 * off a rate card.
 */
function RecordedSalesBreakdownTable({
	kind,
	rows,
	totalRm,
	totalUnits,
}: {
	kind: "drinks" | "tips";
	rows: RosterRecordedSalesRow[];
	totalRm: number;
	totalUnits: number;
}) {
	const { t } = usePortalLocale();
	const amountOf = (row: RosterRecordedSalesRow) =>
		kind === "drinks" ? row.drinkSalesRm : row.tipRm;
	const anyRecorded = rows.some((row) => amountOf(row) > 0);
	return (
		<>
			<p className="iz-tiny iz-muted mt-3">
				{t.agencyRoster.recordedSalesHint}
			</p>
			<div className="iz-outlet-live-earnings-table-wrap iz-outlet-live-earnings-table-wrap--sheet">
				<table className="iz-outlet-live-earnings-table iz-outlet-live-earnings-table--sheet">
					<thead>
						<tr>
							<th>
								<LiveEarningsLabel label={t.today.colPrName} />
							</th>
							<th>
								<LiveEarningsLabel
									label={
										kind === "drinks" ? t.today.drinkSales : t.reports.colTips
									}
								/>
							</th>
						</tr>
					</thead>
					<tbody>
						{!anyRecorded ? (
							<tr>
								<td
									colSpan={2}
									className="iz-outlet-live-earnings-table__empty"
								>
									{kind === "drinks"
										? t.agencyRoster.noDrinkSalesThisShift
										: t.agencyRoster.noTipsThisShift}
								</td>
							</tr>
						) : (
							rows.map((row) => (
								<tr key={row.slotId}>
									<td className="iz-outlet-live-earnings-table__name">
										{row.prName}
									</td>
									<td className="iz-outlet-live-earnings-table__amount">
										{amountOf(row) > 0 ? formatRM(amountOf(row)) : "—"}
										{kind === "drinks" && row.drinkUnits > 0 ? (
											<span className="iz-tiny iz-muted2 block">
												{fill(
													row.drinkUnits === 1
														? t.today.unitCountOne
														: t.today.unitCountMany,
													{ n: row.drinkUnits },
												)}
											</span>
										) : null}
									</td>
								</tr>
							))
						)}
					</tbody>
					{anyRecorded && (
						<tfoot>
							<tr className="iz-outlet-live-earnings-table__foot">
								<th scope="row">
									<LiveEarningsLabel label={t.agencyRoster.shiftTotal} />
								</th>
								<td>
									{formatRM(totalRm)}
									{kind === "drinks" && totalUnits > 0 ? (
										<span className="iz-tiny iz-muted2 block">
											{fill(
												totalUnits === 1
													? t.today.unitCountOne
													: t.today.unitCountMany,
												{ n: totalUnits },
											)}
										</span>
									) : null}
								</td>
							</tr>
						</tfoot>
					)}
				</table>
			</div>
		</>
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
	recordedBySlotId,
	onClose,
}: {
	kind: RosterEarningsSheetKind | null;
	anchorSlot: AgencyRosterSlot | null;
	earningsContext: RosterShiftEarningsContext;
	/**
	 * A real session's recorded floor sales per slot — the Drinks and Tips
	 * columns' own figures. Null / omitted = a demo session: fixture tables.
	 */
	recordedBySlotId?: Map<string, RecordedFloorSales> | null;
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	/*
	 * Drinks / Tips on a real session break down the SERVER's recorded sales —
	 * the figures the columns show — not the demo engine, which a real login
	 * leaves nothing to price and so answered "No drink sales logged" beneath a
	 * column holding the night.
	 */
	const recordedSales = useMemo(
		() =>
			(kind === "drinks" || kind === "tips") && anchorSlot && recordedBySlotId
				? rosterRecordedSalesRows(
						anchorSlot,
						earningsContext.rosterScope,
						recordedBySlotId,
					)
				: null,
		[anchorSlot, kind, earningsContext, recordedBySlotId],
	);
	/*
	 * A slot the SERVER priced (a real session) is broken down by the server's
	 * figures; a demo slot keeps the fixture engine below. Decided per anchor, by
	 * the same test the Est. payout column itself uses.
	 */
	const serverWages = useMemo(
		() =>
			kind === "payout" && anchorSlot && slotHasServerWage(anchorSlot)
				? rosterServerWageRows(
						anchorSlot,
						earningsContext.rosterScope,
						earningsContext.agencyPRs,
					)
				: null,
		[anchorSlot, kind, earningsContext],
	);
	const rows = useMemo(
		() =>
			anchorSlot && kind && !serverWages && !recordedSales
				? rosterShiftEarningsRows(anchorSlot, earningsContext)
				: [],
		[anchorSlot, kind, earningsContext, serverWages, recordedSales],
	);

	if (!kind || !anchorSlot) return null;

	const shiftLabel = `${anchorSlot.outlet} · ${anchorSlot.shift}`;

	return (
		<IzSheet open onClose={onClose} wide liveSales>
			<IzCardTitle>{SHEET_TITLE[kind](t)}</IzCardTitle>
			<p className="iz-sm iz-muted mt-1.5">{shiftLabel}</p>

			{(kind === "drinks" || kind === "tips") &&
				(recordedSales ? (
					<RecordedSalesBreakdownTable
						kind={kind}
						rows={recordedSales.rows}
						totalRm={
							kind === "drinks"
								? recordedSales.drinkSalesRm
								: recordedSales.tipRm
						}
						totalUnits={recordedSales.drinkUnits}
					/>
				) : kind === "drinks" ? (
					<DrinksBreakdownTable rows={rows} />
				) : (
					<TipsBreakdownTable rows={rows} />
				))}
			{kind === "payout" &&
				(serverWages ? (
					<ServerWageBreakdownTable
						rows={serverWages.rows}
						totalRm={serverWages.totalRm}
					/>
				) : (
					<OutletPrLiveSalesFloorTable rows={rows} className="mt-4" />
				))}

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
