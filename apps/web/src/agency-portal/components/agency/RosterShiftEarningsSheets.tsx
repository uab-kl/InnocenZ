import { useMemo } from 'react';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { formatRM, IzCardTitle } from '@agency-portal/components/iz/ui';
import { LiveEarningsLabel } from '@agency-portal/components/outlet/outlet-live-sales-ui';
import { OutletPrLiveSalesFloorTable } from '@agency-portal/components/outlet/OutletPrLiveSalesFloorTable';
import type { AgencyRosterSlot } from '@agency-portal/lib/agency-demo';
import {
  rosterShiftEarningsRows,
  roundRm,
  type OutletPrLiveEarningsBreakdown,
  type RosterShiftEarningsContext,
} from '@agency-portal/lib/outlet-financial-sync';

export type RosterEarningsSheetKind = 'drinks' | 'tips' | 'payout';

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
            <th>
              <LiveEarningsLabel label="HH" />
            </th>
            <th>
              <LiveEarningsLabel label="Normal" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="iz-outlet-live-earnings-table__empty">
                No drink sales logged for this shift yet.
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
                Floor drinks {formatRM(roundRm(totals.drinkSales))}
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
  const total = roundRm(rows.reduce((sum, row) => sum + row.tipSalesRm, 0));

  return (
    <div className="iz-outlet-live-earnings-table-wrap iz-outlet-live-earnings-table-wrap--sheet">
      <table className="iz-outlet-live-earnings-table iz-outlet-live-earnings-table--sheet">
        <thead>
          <tr>
            <th>
              <LiveEarningsLabel label="Tips" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="iz-outlet-live-earnings-table__empty">
                No tips logged for this shift yet.
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

const SHEET_TITLE: Record<RosterEarningsSheetKind, string> = {
  drinks: 'Drinks breakdown',
  tips: 'Tips breakdown',
  payout: 'Est. payout breakdown',
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
      <IzCardTitle>{SHEET_TITLE[kind]}</IzCardTitle>
      <p className="iz-sm iz-muted mt-1.5">{shiftLabel}</p>

      {kind === 'drinks' && <DrinksBreakdownTable rows={rows} />}
      {kind === 'tips' && <TipsBreakdownTable rows={rows} />}
      {kind === 'payout' && (
        <OutletPrLiveSalesFloorTable rows={rows} className="mt-4" />
      )}

      <button
        type="button"
        className="iz-btn iz-btn-soft mt-4 w-full"
        onClick={onClose}
      >
        Close
      </button>
    </IzSheet>
  );
}
