import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { IzCard, formatRM } from '@agency-portal/components/iz/ui';
import { PrWeeklyPaymentGrid } from '@agency-portal/components/pr/PrWeeklyPaymentGrid';
import { PrPvDisputeSheet } from '@agency-portal/components/pr/PrPvDisputeSheet';
import { PrStatusPill } from '@agency-portal/components/pr/PrOfferRow';
import {
  pvNeedsPrReview,
  pvStatusLabel,
  pvStatusPillVariant,
} from '@agency-portal/lib/pr-demo';
import type { PrPaymentVoucher } from '@agency-portal/lib/pr-demo';
import { isPrPaymentActionPv } from '@agency-portal/lib/pr-payment-history';
import {
  buildWeeklyDisputeMessage,
  pvHasOpenDisputes,
  type WeeklyDisputeTarget,
  type WeeklyPaymentSummary,
} from '@agency-portal/lib/pr-weekly-payment';
import { cn } from '@agency-portal/lib/utils';

function weekTotalRm(summary: WeeklyPaymentSummary): number {
  const n = summary.totals.net;
  return Number.isFinite(n) ? n : 0;
}

export function PrWeeklyPaymentWeekCard({
  title,
  summary,
  weekPhase,
  defaultOpen = true,
  pv,
  onOpenPv,
  onDispute,
  onWithdrawDispute,
}: {
  title: string;
  summary: WeeklyPaymentSummary;
  weekPhase: 'open' | 'issued';
  defaultOpen?: boolean;
  pv?: PrPaymentVoucher | null;
  onOpenPv?: (id: string) => void;
  onDispute?: (
    reason: string,
    photoDataUrls?: string[],
    targets?: WeeklyDisputeTarget[],
  ) => void;
  onWithdrawDispute?: (targets: WeeklyDisputeTarget[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [disputeMode, setDisputeMode] = useState<'dispute' | 'withdraw'>(
    'dispute',
  );
  const [disputeReason, setDisputeReason] = useState('');
  const [disputePhotos, setDisputePhotos] = useState<string[]>([]);
  const [disputeTargets, setDisputeTargets] = useState<WeeklyDisputeTarget[]>(
    [],
  );
  const [activeDisputeKey, setActiveDisputeKey] = useState<string | null>(null);

  const needsReview = Boolean(
    pv && (pvNeedsPrReview(pv.status) || pv.status === 'DISPUTED'),
  );
  const actionPv = pv && isPrPaymentActionPv(pv) ? pv : null;
  const canDispute = Boolean(
    weekPhase === 'issued' && actionPv && needsReview && onDispute,
  );
  const hasOpenDisputes = Boolean(pv && pvHasOpenDisputes(pv, summary));

  const openDisputeForDay = (targets: WeeklyDisputeTarget[]) => {
    if (!canDispute || targets.length === 0) return;
    const text = targets.map((t) => buildWeeklyDisputeMessage(t)).join('\n\n');
    setDisputeMode('dispute');
    setDisputeTargets(targets);
    setDisputeReason(text);
    if (targets.length === 1) {
      const t = targets[0];
      setActiveDisputeKey(`${t.dateIso}-${t.incomeKey}`);
    } else {
      setActiveDisputeKey(null);
    }
    setDisputeSheetOpen(true);
  };

  const openWithdrawForDay = (targets: WeeklyDisputeTarget[]) => {
    if (!actionPv || !onWithdrawDispute || targets.length === 0) return;
    setDisputeMode('withdraw');
    setDisputeTargets(targets);
    setDisputeReason('');
    if (targets.length === 1) {
      const t = targets[0];
      setActiveDisputeKey(`${t.dateIso}-${t.incomeKey}`);
    } else {
      setActiveDisputeKey(null);
    }
    setDisputeSheetOpen(true);
  };

  const closeDisputeSheet = () => {
    setDisputeSheetOpen(false);
    setDisputeTargets([]);
    setActiveDisputeKey(null);
  };

  const submitDispute = () => {
    if (!onDispute || !disputeReason.trim()) return;
    onDispute(
      disputeReason,
      disputePhotos.length ? disputePhotos : undefined,
      disputeTargets.length ? disputeTargets : undefined,
    );
    closeDisputeSheet();
    setDisputeReason('');
    setDisputePhotos([]);
  };

  const submitWithdraw = () => {
    if (!onWithdrawDispute || disputeTargets.length === 0) return;
    onWithdrawDispute(disputeTargets);
    closeDisputeSheet();
  };

  return (
    <section
      className={cn(
        'iz-collapsible-section iz-pr-week-pay-collapsible',
        open && 'is-open',
        needsReview && 'iz-pr-week-pay-collapsible--review',
      )}
    >
      <button
        type="button"
        className="iz-collapsible-section__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1">
          <span className="iz-collapsible-section__title">{title}</span>
          {!open && (
            <span className="iz-collapsible-section__hint">
              {summary.weekLabel} · {formatRM(weekTotalRm(summary))} ·{' '}
              {summary.verifiedDayCount}/7 verified
            </span>
          )}
          <span className="iz-collapsible-section__action">
            {open ? 'Tap to collapse' : 'Tap to expand'}
          </span>
        </span>
        {pv && (
          <PrStatusPill variant={pvStatusPillVariant(pv.status)}>
            {pvStatusLabel(pv.status)}
          </PrStatusPill>
        )}
        <span className="iz-pr-week-pay-collapsible__verified font-sora text-base font-extrabold text-[var(--iz-violet-l)]">
          {summary.verifiedDayCount}/7
        </span>
        <span className="iz-collapsible-section__chev" aria-hidden>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>
      {open && (
        <div className="iz-collapsible-section__body iz-pr-week-pay-collapsible__body">
          <IzCard className="iz-pr-week-pay-card !mt-0">
            <div className="iz-pr-week-pay-card__head">
              <div>
                <p className="iz-pr-week-pay-card__title">{title}</p>
                <p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
                  {summary.weekLabel}
                </p>
              </div>
              <div className="text-right">
                <p className="iz-tiny iz-muted2">Verified days</p>
                <p className="font-sora text-base font-extrabold text-[var(--iz-violet-l)]">
                  {summary.verifiedDayCount}/7
                </p>
              </div>
            </div>
            <PrWeeklyPaymentGrid
              summary={summary}
              large
              weekPhase={weekPhase}
              interactive={canDispute || Boolean(onWithdrawDispute && actionPv)}
              onDisputeDay={openDisputeForDay}
              onWithdrawDay={openWithdrawForDay}
              activeDisputeKey={activeDisputeKey}
            />
            <p className="iz-tiny iz-muted2 mt-2 text-center">
              {weekPhase === 'open' && !summary.pvReady ? (
                <>
                  PV will be sent on <b>{summary.issueDayLabel}</b> after this
                  week ends · running total{' '}
                  <b className="text-[var(--iz-gold)]">
                    {formatRM(weekTotalRm(summary))}
                  </b>
                </>
              ) : (
                <>
                  PV issued every Sunday · Total{' '}
                  <b className="text-[var(--iz-gold)]">
                    {formatRM(weekTotalRm(summary))}
                  </b>
                </>
              )}
            </p>
            {actionPv && needsReview && !hasOpenDisputes && (
              <button
                type="button"
                className="iz-btn iz-btn-primary iz-btn-sm mt-2 w-full"
                onClick={() => onOpenPv?.(actionPv.id)}
              >
                Review &amp; sign · {formatRM(weekTotalRm(summary))}
              </button>
            )}
          </IzCard>
        </div>
      )}

      <PrPvDisputeSheet
        open={disputeSheetOpen}
        onClose={closeDisputeSheet}
        mode={disputeMode}
        targets={disputeTargets}
        reason={disputeReason}
        onReasonChange={setDisputeReason}
        photos={disputePhotos}
        onPhotosChange={setDisputePhotos}
        onSubmit={submitDispute}
        onWithdraw={submitWithdraw}
      />
    </section>
  );
}
