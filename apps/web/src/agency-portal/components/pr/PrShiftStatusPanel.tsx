import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Check,
  Shield,
  AlertTriangle,
  Camera,
  FileText,
  PenLine,
  RotateCcw,
  Clock,
  Trash2,
} from 'lucide-react';
import { useStore } from '@agency-portal/lib/store';
import { formatRM, IzCardTitle } from '@agency-portal/components/iz/ui';
import { LabelWithIcon } from '@agency-portal/components/iz/TitleWithIcon';
import { IzHScroll } from '@agency-portal/components/iz/HScroll';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { PrSection } from '@agency-portal/components/pr/PrSection';
import { ReceiptScanSlip } from '@agency-portal/components/pr/ReceiptScanSlip';
import {
  formatReceiptScannedTime,
  isManualSelfLog,
  isSelfLogPendingAgency,
  receiptScanCategory,
  type PrActiveShiftSession,
  type PrReceiptScan,
} from '@agency-portal/lib/pr-demo';
import {
  DEFAULT_SHIFT_SALES_TARGETS,
  buildShiftStatusRows,
  receiptItemsForShift,
  shiftCommissionTotal,
  shiftDurationLabel,
  shiftPayoutTotal,
  shiftCommissionRemaining,
  shiftSalesLogged,
  shiftSalesRemaining,
  shiftSalesTargetRm,
} from '@agency-portal/lib/pr-shift-status';

function VerifyBadge({
  verified,
  kind,
  note,
  scan,
}: {
  verified: boolean;
  kind: 'duty' | 'receipt';
  note?: string;
  scan?: PrReceiptScan;
}) {
  if (kind === 'duty') {
    return (
      <span
        className="iz-pr-shift-verify iz-pr-shift-verify--sealed"
        title={note}
      >
        <Shield className="h-3 w-3" /> Sealed
      </span>
    );
  }
  if (scan && isManualSelfLog(scan)) {
    return (
      <span
        className="iz-pr-shift-verify iz-pr-shift-verify--pending"
        title={note}
      >
        <Clock className="h-3 w-3" /> Pending verification
      </span>
    );
  }
  if (verified) {
    return (
      <span
        className="iz-pr-shift-verify iz-pr-shift-verify--matched"
        title={note}
      >
        <Check className="h-3 w-3" /> Matched
      </span>
    );
  }
  return (
    <span
      className="iz-pr-shift-verify iz-pr-shift-verify--review"
      title={note}
    >
      <AlertTriangle className="h-3 w-3" /> Review
    </span>
  );
}

const SCAN_RECEIPT_ROWS: { category: 'drinks' | 'tips'; label: string }[] = [
  { category: 'drinks', label: 'Drinks' },
  { category: 'tips', label: 'Tips' },
];

function ShiftReceiptScanRows() {
  return (
    <div className="iz-pr-shift-scan-rows">
      {SCAN_RECEIPT_ROWS.map((row) => (
        <div key={row.category} className="iz-pr-shift-scan-row">
          <span className="iz-pr-shift-scan-row__label">{row.label}</span>
          <div className="flex w-full flex-col gap-1.5">
            <Link
              to="/host/scan"
              search={{ category: row.category }}
              className="iz-btn iz-btn-soft iz-btn-sm iz-pr-shift-scan-row__btn w-full"
            >
              <Camera className="h-3.5 w-3.5" />
              Scan
            </Link>
            <Link
              to="/host/scan"
              search={
                row.category === 'drinks'
                  ? { category: row.category, manual: true }
                  : { category: row.category, blurry: true }
              }
              className="iz-btn iz-btn-soft iz-btn-sm iz-pr-shift-scan-row__btn iz-pr-shift-scan-row__btn--selflog w-full"
            >
              <PenLine className="h-3.5 w-3.5" />
              Self-log
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PrShiftStatusPanel({
  session,
  scans,
  baseWages,
  checkedOut,
  tierSalesTargetRm,
  prTier,
}: {
  session: PrActiveShiftSession | null | undefined;
  scans: PrReceiptScan[];
  baseWages: number;
  checkedOut: boolean;
  /** Outlet shift sales target for this PR's tier (RM) */
  tierSalesTargetRm?: number;
  prTier?: string;
}) {
  const shiftScans = useMemo(
    () => receiptItemsForShift(session, scans),
    [session, scans],
  );
  const rows = useMemo(
    () =>
      session
        ? buildShiftStatusRows(session, shiftScans, baseWages, {
            freezeSelfLogVerification: true,
          })
        : [],
    [session, shiftScans, baseWages],
  );
  const commissionTotal = shiftCommissionTotal(shiftScans);
  const payout = shiftPayoutTotal(baseWages, shiftScans);
  const useTierSalesTarget = (tierSalesTargetRm ?? 0) > 0;
  const targets = DEFAULT_SHIFT_SALES_TARGETS;
  const targetRm = useTierSalesTarget
    ? tierSalesTargetRm!
    : shiftSalesTargetRm(targets);
  const salesLogged = shiftSalesLogged(shiftScans);
  const remaining = useTierSalesTarget
    ? shiftSalesRemaining(salesLogged, targetRm)
    : shiftCommissionRemaining(commissionTotal, targets);
  const targetMet = remaining <= 0;
  const progressValue = useTierSalesTarget ? salesLogged : commissionTotal;
  const targetPct = Math.min(
    100,
    targetRm > 0 ? (progressValue / targetRm) * 100 : 0,
  );
  const receiptRows = rows.filter((r) => r.kind === 'receipt');
  const verifiedReceipts = receiptRows.filter((r) => r.verified).length;
  const pendingReceipts = receiptRows.length - verifiedReceipts;
  const pendingSelfLogs = receiptRows.filter(
    (r) => r.scan && isSelfLogPendingAgency(r.scan),
  ).length;
  const statusHint =
    receiptRows.length === 0
      ? 'Use Scan receipt — each log adds a row below'
      : pendingSelfLogs > 0
        ? `${pendingSelfLogs} receipt${pendingSelfLogs !== 1 ? 's' : ''} pending verification in Payment`
        : pendingReceipts > 0
          ? `${pendingReceipts} receipt${pendingReceipts !== 1 ? 's' : ''} need review`
          : `${verifiedReceipts} receipt${verifiedReceipts !== 1 ? 's' : ''} matched · PV ready`;

  const [viewScan, setViewScan] = useState<PrReceiptScan | null>(null);
  const deleteReceiptSelfLog = useStore((s) => s.deleteReceiptSelfLog);

  const handleDeleteSelfLog = (scan: PrReceiptScan) => {
    if (
      !window.confirm(
        `Delete this self-log (${scan.receiptRef})? It will be removed before agency verification.`,
      )
    ) {
      return;
    }
    deleteReceiptSelfLog(scan.id);
    setViewScan((current) => (current?.id === scan.id ? null : current));
  };

  const wagesFinalized = checkedOut || Boolean(session?.timeOut);

  if (!session) return null;

  return (
    <div className="iz-pr-shift-status">
      <div className="iz-pr-shift-status__times">
        <div className="iz-pr-shift-status__time-cell">
          <LabelWithIcon label="Check-in" className="l" />
          <span className="n">{session.timeIn}</span>
        </div>
        <div className="iz-pr-shift-status__time-cell">
          <LabelWithIcon label="Check-out" className="l" />
          <span className="n">
            {session.timeOut ?? (checkedOut ? '—' : 'Pending')}
          </span>
        </div>
        <div className="iz-pr-shift-status__time-cell">
          <LabelWithIcon label="Duration" className="l" />
          <span className="n">
            {session.timeOut || checkedOut
              ? shiftDurationLabel(session)
              : 'In progress'}
          </span>
        </div>
      </div>

      <div className="iz-pr-shift-status__targets">
        <p className="iz-pr-shift-status__targets-label">
          {targetMet ? 'Shift target' : 'To target'}
          {useTierSalesTarget && prTier ? (
            <span className="ml-1 text-[var(--iz-muted2)]">· {prTier}</span>
          ) : null}
        </p>
        <div className="iz-pr-shift-status__target-price">
          {targetMet ? (
            <>
              <span className="v text-[var(--iz-green)]">Met</span>
              <span className="t">{formatRM(targetRm)}</span>
            </>
          ) : (
            <>
              <span className="v">{formatRM(remaining)}</span>
              <span className="t">left · target {formatRM(targetRm)}</span>
            </>
          )}
        </div>
        <div className="iz-pr-shift-status__bar iz-pr-shift-status__bar--single">
          <div
            className="iz-pr-shift-status__bar-fill commission"
            style={{ width: `${targetPct}%` }}
          />
        </div>
      </div>

      {!checkedOut && <ShiftReceiptScanRows />}

      <PrSection
        title="Status"
        hint={statusHint}
        collapsible
        defaultOpen
        className="!mt-3"
      >
        <IzHScroll className="iz-pr-shift-status__table-wrap iz-hscroll--free">
          <table className="iz-pr-shift-status__table iz-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Source</th>
                {wagesFinalized && <th>Wages</th>}
                <th>Comm.</th>
                <th>Verify</th>
                <th>Receipt</th>
                {!checkedOut && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.kind === 'receipt' &&
                    row.scan &&
                    isManualSelfLog(row.scan)
                      ? 'iz-pr-shift-status__row--selflog'
                      : row.kind === 'receipt' && !row.verified
                        ? 'iz-pr-shift-status__row--warn'
                        : undefined
                  }
                >
                  <td>
                    <div className="iz-pr-shift-status__item">
                      <span className="iz-pr-shift-status__item-label">
                        {row.label}
                      </span>
                      {row.detail && (
                        <span className="iz-pr-shift-status__item-detail">
                          {row.detail}
                        </span>
                      )}
                      {row.kind === 'receipt' &&
                        row.verifyNote &&
                        !row.verified && (
                          <span className="iz-pr-shift-status__item-note">
                            {row.verifyNote}
                          </span>
                        )}
                    </div>
                  </td>
                  <td className="iz-pr-shift-status__product">
                    {row.kind === 'receipt' ? (row.product ?? '—') : '—'}
                  </td>
                  <td className="iz-pr-shift-status__qty">
                    {row.kind === 'receipt' ? (row.qty ?? '—') : '—'}
                  </td>
                  <td className="iz-pr-shift-status__source">{row.source}</td>
                  {wagesFinalized && (
                    <td className="iz-pr-shift-status__money wages">
                      {row.wagesRm > 0 ? formatRM(row.wagesRm) : '—'}
                    </td>
                  )}
                  <td className="iz-pr-shift-status__money commission">
                    {row.commissionRm > 0 ? formatRM(row.commissionRm) : '—'}
                  </td>
                  <td>
                    <VerifyBadge
                      verified={row.verified}
                      kind={row.kind}
                      note={row.verifyNote}
                      scan={row.scan}
                    />
                  </td>
                  <td className="iz-pr-shift-status__receipt">
                    {row.kind === 'receipt' && row.scan ? (
                      <button
                        type="button"
                        className="iz-pr-shift-status__receipt-btn"
                        onClick={() => setViewScan(row.scan!)}
                        title="View scanned receipt"
                      >
                        <FileText className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{row.scan.receiptRef}</span>
                      </button>
                    ) : (
                      <span className="iz-tiny iz-muted2">—</span>
                    )}
                  </td>
                  {!checkedOut && (
                    <td className="iz-pr-shift-status__actions">
                      {row.kind === 'receipt' && row.scan ? (
                        <div className="iz-pr-shift-status__action-btns">
                          {isManualSelfLog(row.scan) &&
                          isSelfLogPendingAgency(row.scan) ? (
                            <>
                              <Link
                                to="/host/scan"
                                search={{ edit: row.scan.id }}
                                className="iz-pr-shift-status__action-btn iz-pr-shift-status__action-btn--edit"
                                title="Edit self-log"
                              >
                                <PenLine className="h-3 w-3" />
                              </Link>
                              <button
                                type="button"
                                className="iz-pr-shift-status__action-btn iz-pr-shift-status__action-btn--delete"
                                title="Delete self-log"
                                onClick={() => handleDeleteSelfLog(row.scan!)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          ) : null}
                          <Link
                            to="/host/scan"
                            search={{
                              rescan: row.scan.id,
                              category: receiptScanCategory(row.scan),
                            }}
                            className="iz-pr-shift-status__action-btn"
                            title="Scan again"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Link>
                        </div>
                      ) : (
                        <span className="iz-tiny iz-muted2">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="iz-pr-shift-status__foot">
                <td colSpan={4}>
                  <span className="font-sora text-[10px] font-bold uppercase tracking-wide text-[var(--iz-muted)]">
                    Totals
                  </span>
                  <p className="iz-tiny iz-muted2 mt-0.5">
                    {wagesFinalized
                      ? `Payout ${formatRM(payout)} · shift pay + commission`
                      : 'Total excluding wages & OT'}
                  </p>
                </td>
                {wagesFinalized && (
                  <td className="iz-pr-shift-status__money wages font-sora font-bold">
                    {formatRM(baseWages)}
                  </td>
                )}
                <td className="iz-pr-shift-status__money commission font-sora font-bold">
                  {formatRM(commissionTotal)}
                </td>
                <td />
                <td />
                {!checkedOut && <td />}
              </tr>
            </tfoot>
          </table>
        </IzHScroll>

        <IzSheet open={viewScan !== null} onClose={() => setViewScan(null)}>
          {viewScan && (
            <div className="iz-sheet-body">
              <h3 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
                {viewScan.receiptRef}
              </h3>
              <p className="iz-tiny iz-muted mt-0.5">
                Scanned receipt · {viewScan.outlet} ·{' '}
                {formatReceiptScannedTime(viewScan.scannedAt)}
              </p>
              <ReceiptScanSlip scan={viewScan} />
              {!checkedOut && (
                <div className="mt-4 flex flex-col gap-2">
                  {isManualSelfLog(viewScan) &&
                    isSelfLogPendingAgency(viewScan) && (
                      <>
                        <Link
                          to="/host/scan"
                          search={{ edit: viewScan.id }}
                          className="iz-btn iz-btn-primary iz-btn-sm w-full"
                          onClick={() => setViewScan(null)}
                        >
                          <PenLine className="h-4 w-4" /> Edit self-log
                        </Link>
                        <button
                          type="button"
                          className="iz-btn iz-btn-ghost iz-btn-sm w-full text-[var(--iz-red)]"
                          onClick={() => handleDeleteSelfLog(viewScan)}
                        >
                          <Trash2 className="h-4 w-4" /> Delete self-log
                        </button>
                      </>
                    )}
                  <Link
                    to="/host/scan"
                    search={{
                      rescan: viewScan.id,
                      category: receiptScanCategory(viewScan),
                    }}
                    className="iz-btn iz-btn-soft iz-btn-sm w-full"
                    onClick={() => setViewScan(null)}
                  >
                    <RotateCcw className="h-4 w-4" /> Scan again
                  </Link>
                </div>
              )}
            </div>
          )}
        </IzSheet>

        {shiftScans.length === 0 && (
          <p className="iz-tiny iz-muted2 mt-2 text-center">
            {wagesFinalized
              ? 'Shift pay is sealed when you check out (wages column). Scan receipts to add rows — each receipt scan is verified for commission.'
              : 'Shift pay is calculated when you check out. Scan receipts to add commission rows below.'}
          </p>
        )}
      </PrSection>
    </div>
  );
}
