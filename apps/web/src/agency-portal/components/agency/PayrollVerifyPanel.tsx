import { IzCard, IzSectionLabel } from '@agency-portal/components/iz/ui';
import { useAgencyPvEvidence } from '@agency-portal/hooks/use-agency-pvs';
import type {
  PaymentVoucherComponent,
  PaymentVoucherLine,
  PaymentVoucherReceipt,
} from '@/services/payment-voucher';
import { FileWarning, Receipt, ScanLine } from 'lucide-react';

const COMPONENT_LABELS: Record<PaymentVoucherComponent, string> = {
  wages: 'Wages',
  drink_commission: 'Drinks commission',
  tip_commission: 'Tips commission',
  ot: 'Overtime',
  deduction: 'Deductions',
  other: 'Other',
};

/** Commission is earned per receipt, so only these two need evidence. */
const NEEDS_EVIDENCE: PaymentVoucherComponent[] = [
  'drink_commission',
  'tip_commission',
];

const money = (n: number) => `RM ${n.toFixed(2)}`;
const sum = (lines: PaymentVoucherLine[]) =>
  lines.reduce((total, line) => total + Number(line.amount || 0), 0);

function sourceLabel(source: PaymentVoucherReceipt['source']): string {
  if (source === 'scan') return 'Scanned';
  if (source === 'manual') return 'Self-logged';
  return 'Check-in';
}

/**
 * What the agency checks before issuing a week's voucher: every line grouped by
 * component, and — the point of the screen — which commission lines have no
 * receipt behind them.
 *
 * The distinction matters because of how the money works: the outlet pays the
 * agency on ALL sales, but a PR earns commission only on receipts they actually
 * scanned or self-logged. A self-declared line with no receipt is the one thing
 * an agency cannot check against anything, so it is surfaced rather than left to
 * be spotted in a list.
 *
 * Read-only by design. There is no verify/approve endpoint yet, and a button
 * that only changed local state would repeat the mistake the dispute "resolve"
 * button already makes.
 */
export function PayrollVerifyPanel({ voucherId }: { voucherId: string | null }) {
  const { voucher, isLoading } = useAgencyPvEvidence(voucherId);

  if (!voucherId) return null;
  if (isLoading) {
    return (
      <>
        <IzSectionLabel>Verify</IzSectionLabel>
        <IzCard>
          <p className="iz-tiny iz-muted">Loading receipts…</p>
        </IzCard>
      </>
    );
  }
  if (!voucher) return null;

  const lines = voucher.lines ?? [];
  const receipts = voucher.receipts ?? [];

  const commissionLines = lines.filter(
    (line) => line.component !== null && NEEDS_EVIDENCE.includes(line.component),
  );
  const unbacked = commissionLines.filter((line) => !line.receiptId);
  const unclassified = lines.filter((line) => line.component === null);

  // Group every line by bucket so the week reconciles on screen.
  const groups = new Map<string, PaymentVoucherLine[]>();
  for (const line of lines) {
    const key = line.component ?? 'unclassified';
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  return (
    <>
      <IzSectionLabel>Verify</IzSectionLabel>

      {unbacked.length > 0 ? (
        <IzCard className="border-[rgba(217,185,122,.35)]">
          <div className="flex items-start gap-2">
            <FileWarning className="mt-0.5 h-4 w-4 text-[var(--iz-amber,#d9b97a)]" />
            <div>
              <div className="text-sm font-semibold">
                {unbacked.length} commission{' '}
                {unbacked.length === 1 ? 'line has' : 'lines have'} no receipt
              </div>
              <p className="iz-tiny iz-muted mt-1">
                {money(sum(unbacked))} was self-declared with nothing to check it
                against. Confirm with the outlet before issuing.
              </p>
              <ul className="mt-2 space-y-1">
                {unbacked.map((line) => (
                  <li key={line.id} className="iz-tiny iz-muted2">
                    {line.lineDate ?? '—'} · {line.description} ·{' '}
                    {money(Number(line.amount || 0))}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </IzCard>
      ) : (
        <IzCard>
          <p className="iz-tiny iz-muted">
            {commissionLines.length > 0
              ? 'Every commission line on this voucher is backed by a receipt.'
              : 'This voucher has no commission lines to verify.'}
          </p>
        </IzCard>
      )}

      <IzCard>
        <div className="text-sm font-semibold">This week by component</div>
        <div className="mt-2">
          {[...groups.entries()].map(([key, groupLines]) => (
            <div
              key={key}
              className="flex items-center justify-between border-b border-[var(--iz-line)] py-2 last:border-0"
            >
              <div>
                <div className="text-sm">
                  {key === 'unclassified'
                    ? 'Unclassified'
                    : COMPONENT_LABELS[key as PaymentVoucherComponent]}
                </div>
                <div className="iz-tiny iz-muted2">
                  {groupLines.length} {groupLines.length === 1 ? 'line' : 'lines'}
                </div>
              </div>
              <div className="font-medium">{money(sum(groupLines))}</div>
            </div>
          ))}
        </div>
        {unclassified.length > 0 && (
          <p className="iz-tiny iz-muted2 mt-2">
            Unclassified lines predate component tracking — they are counted in
            the totals but cannot be disputed per component.
          </p>
        )}
      </IzCard>

      <IzCard>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Receipt className="h-4 w-4" /> Receipts ({receipts.length})
        </div>
        {receipts.length === 0 ? (
          <p className="iz-tiny iz-muted mt-2">
            No receipts logged for this week.
          </p>
        ) : (
          <div className="mt-2">
            {receipts.map((receipt) => {
              const backed = lines.filter(
                (line) => line.receiptId === receipt.id,
              );
              const proofCount = receipt.proofPhotos?.length ?? 0;
              return (
                <div
                  key={receipt.id}
                  className="border-b border-[var(--iz-line)] py-2 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ScanLine className="h-3.5 w-3.5" />
                      <span className="text-sm font-medium">
                        {receipt.receiptNo}
                      </span>
                      <span
                        className={`iz-pill !text-[10px] ${receipt.source === 'scan' ? 'iz-pill-green' : 'iz-pill-amber'}`}
                      >
                        {sourceLabel(receipt.source)}
                      </span>
                    </div>
                    <span className="font-medium">{money(sum(backed))}</span>
                  </div>
                  <p className="iz-tiny iz-muted2 mt-0.5">
                    {receipt.receiptDate ?? '—'}
                    {receipt.orderNo ? ` · order ${receipt.orderNo}` : ''} ·{' '}
                    {backed.length} {backed.length === 1 ? 'line' : 'lines'} ·{' '}
                    {proofCount > 0
                      ? `${proofCount} proof photo${proofCount === 1 ? '' : 's'}`
                      : 'no proof photo'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </IzCard>
    </>
  );
}
