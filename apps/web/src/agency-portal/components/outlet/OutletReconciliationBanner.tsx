import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '@agency-portal/lib/store';
import { outletCan } from '@agency-portal/lib/outlet-rbac';
import { shouldShowWeeklyReconciliation } from '@agency-portal/lib/reconciliation-weekly';
import { formatRM } from '@agency-portal/components/iz/ui';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@agency-portal/lib/utils';

export function OutletReconciliationBanner() {
  const outletSubRole = useStore((s) => s.outletSubRole);
  const {
    agencyReconciliation,
    confirmOutletReconciliation,
    setReconciliationVarianceReason,
  } = useStore();
  const canConfirm = outletCan(outletSubRole, 'confirmDaily');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(
    agencyReconciliation.varianceReason ?? '',
  );

  if (!canConfirm) return null;
  if (!shouldShowWeeklyReconciliation(agencyReconciliation)) return null;
  if (
    agencyReconciliation.outletConfirmed &&
    agencyReconciliation.agencyConfirmed
  )
    return null;

  const hasVariance = agencyReconciliation.variance !== 0;
  const summary = hasVariance
    ? `Variance ${formatRM(agencyReconciliation.variance)} · action needed`
    : agencyReconciliation.outletConfirmed
      ? 'Awaiting agency confirm'
      : `Confirm week · ${agencyReconciliation.dateLabel}`;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[rgba(232,194,122,.28)] bg-[rgba(232,194,122,.06)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-amber)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--iz-txt)]">
            Weekly reconciliation
          </p>
          <p className="iz-tiny iz-muted truncate">{summary}</p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--iz-muted)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="border-t border-[rgba(232,194,122,.2)] px-3.5 pb-3.5 pt-2">
          <p className="iz-tiny iz-muted">
            {agencyReconciliation.dateLabel} · Sales{' '}
            {formatRM(agencyReconciliation.outletSalesTotal)} vs PV{' '}
            {formatRM(agencyReconciliation.pvTotal)}
          </p>
          {hasVariance && !agencyReconciliation.outletConfirmed && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setReconciliationVarianceReason(reason)}
              placeholder="Variance reason"
              className="mt-2 w-full rounded-xl border border-[var(--iz-line2)] bg-white/[0.03] px-3 py-2 text-xs outline-none"
            />
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {!agencyReconciliation.outletConfirmed && (
              <button
                type="button"
                onClick={() => {
                  if (hasVariance && reason.trim())
                    setReconciliationVarianceReason(reason);
                  confirmOutletReconciliation();
                }}
                className="iz-btn iz-btn-primary iz-btn-sm"
              >
                Confirm
              </button>
            )}
            <Link to="/outlet/billing" className="iz-chip text-[11px]">
              Reports
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
