import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { IzCardTitle } from '@agency-portal/components/iz/ui';
import {
  CANCELLATION_RULE_SUMMARY,
  type CancellationEvaluation,
  type CancellationTier,
} from '@agency-portal/lib/pr-schedule-cancellation';
import { cn } from '@agency-portal/lib/utils';
import { AlertTriangle } from 'lucide-react';

function tierAlertClass(tier: CancellationTier) {
  if (tier === 'safe')
    return 'border-[rgba(74,222,128,.35)] bg-[rgba(74,222,128,.08)]';
  if (tier === 'short_notice')
    return 'border-[rgba(244,183,64,.35)] bg-[rgba(244,183,64,.08)]';
  return 'border-[rgba(255,107,107,.35)] bg-[rgba(255,107,107,.08)]';
}

export function PrShiftCancellationSheet({
  open,
  onClose,
  title,
  outlet,
  dateLine,
  shiftLine,
  evaluation,
  reason,
  onReasonChange,
  onSubmit,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  outlet: string;
  dateLine: string;
  shiftLine?: string;
  evaluation: CancellationEvaluation | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <IzSheet open={open} onClose={onClose}>
      <IzCardTitle>{title}</IzCardTitle>
      <p className="iz-tiny iz-muted mb-2">
        <strong className="text-[var(--iz-txt)]">{outlet}</strong>
        {dateLine ? ` · ${dateLine}` : ''}
        {shiftLine ? ` · ${shiftLine}` : ''}
      </p>
      <p className="iz-pr-note mb-3">
        Shifts are assigned by your agency only — outlets may request you, but
        Atlas confirms every assignment. Declining or cancelling notifies your
        agency.
      </p>
      {evaluation && (
        <div
          className={cn(
            'mb-3 rounded-xl border px-3 py-2.5',
            tierAlertClass(evaluation.tier),
          )}
        >
          <p className="text-sm font-semibold">{evaluation.headline}</p>
          <p className="iz-tiny iz-muted2 mt-1">{evaluation.detail}</p>
        </div>
      )}
      <div className="mb-3 overflow-hidden rounded-xl border border-[var(--iz-line)]">
        <div className="iz-pr-schedule-rules-hd !cursor-default border-0 bg-transparent">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-amber)]" />
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--iz-txt)]">
            Cancellation rules
          </span>
        </div>
        <ul className="iz-pr-schedule-rules-list !mt-0 border-0">
          {CANCELLATION_RULE_SUMMARY.map((r) => (
            <li key={r.label} className={`tone-${r.tone}`}>
              <span className="rule-when">{r.label}</span>
              <span className="rule-out">{r.outcome}</span>
            </li>
          ))}
        </ul>
      </div>
      <label
        className="iz-tiny iz-muted2 mb-1 block"
        htmlFor="pr-shift-cancel-reason"
      >
        Reason (required)
      </label>
      <textarea
        id="pr-shift-cancel-reason"
        className="iz-pv-dispute-input mb-3"
        rows={3}
        placeholder="Describe why you cannot work this shift"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
      />
      <button
        type="button"
        className="iz-btn iz-btn-danger w-full"
        disabled={!reason.trim()}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </IzSheet>
  );
}
