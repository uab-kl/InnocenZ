import { formatRM, IzCard } from '@agency-portal/components/iz/ui';
import {
  RECEIPT_COMMISSION_RULES,
  receiptEntryLoggedLabel,
  receiptEntryMethod,
  type PrReceiptScan,
} from '@agency-portal/lib/pr-demo';

export function ReceiptScanSlip({ scan }: { scan: PrReceiptScan }) {
  const drinkUnits = scan.items
    .filter((i) => i.category === 'drinks')
    .reduce((s, i) => s + i.qty, 0);
  const manual = receiptEntryMethod(scan) === 'manual';

  return (
    <div className="iz-receipt-slip">
      <div className="iz-scanbox iz-receipt-slip__capture">
        <div className="font-sora w-full text-left text-[11px] leading-relaxed text-[var(--iz-txt)]">
          <b className="text-[var(--iz-violet-l)]">
            {manual ? '— MANUAL ENTRY —' : '— OCR EXTRACTED —'}
          </b>
          <br />
          Receipt ID: {scan.receiptRef}
          <br />
          Outlet: {scan.outlet}
          <br />
          PR ID: {scan.prId ?? '—'} · {scan.prCode} ({scan.prName})
          <br />
          {receiptEntryLoggedLabel(scan)}
          <br />
          <br />
          {scan.items.map((item) => (
            <span key={`${item.label}-${item.qty}`}>
              {item.qty}× {item.label} · {formatRM(item.amount)}
              <br />
            </span>
          ))}
          <b>Total logged: {formatRM(scan.totalLogged)}</b>
        </div>
      </div>

      <IzCard
        flat
        className="mt-3 border-[rgba(111,176,255,.25)] bg-[linear-gradient(180deg,rgba(111,176,255,.08),transparent)]"
      >
        <p className="iz-sm font-bold text-[var(--iz-blue)]">
          Commission (PV calc)
        </p>
        <div className="iz-data-table-wrap mt-2">
          <table className="iz-data-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Calc</th>
                <th className="text-right">RM</th>
              </tr>
            </thead>
            <tbody>
              {scan.drinkCommission > 0 && (
                <tr>
                  <td>Drinks</td>
                  <td className="iz-muted">
                    {drinkUnits} units × RM
                    {RECEIPT_COMMISSION_RULES.drinkPerUnit}
                  </td>
                  <td className="text-right">
                    {formatRM(scan.drinkCommission)}
                  </td>
                </tr>
              )}
              {scan.tipCommission > 0 && (
                <tr>
                  <td>Tips</td>
                  <td className="iz-muted">100% of tip logged</td>
                  <td className="text-right">{formatRM(scan.tipCommission)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="font-bold">
                  Total commission
                </td>
                <td className="text-right font-bold">
                  {formatRM(scan.totalCommission)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </IzCard>
    </div>
  );
}
