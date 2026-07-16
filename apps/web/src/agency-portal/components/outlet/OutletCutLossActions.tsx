import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@agency-portal/lib/store';
import type { ShiftRequest } from '@agency-portal/lib/store';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { IzCardTitle, IzPill } from '@agency-portal/components/iz/ui';
import {
  OUTLET_CUTLOSS_BEST_EFFORT_UNUSED_SHARE,
  outletPlanningReleaseClock,
  outletShiftBestEffortSaveCredited,
  outletShiftCutLossAdjustmentsLabel,
  outletShiftCutLossForShift,
  outletShiftCutLossSavings,
  outletShiftDemandSupplied,
  outletShiftPlannedLaborPerSlot,
  outletShiftReleasedUnusedWagesTotal,
  resolveShiftTierRates,
  OUTLET_REDUCE_CUTLOST_SECTION_ID,
} from '@agency-portal/lib/outlet-demo';
import { recommendBestEffortCutlost } from '@agency-portal/lib/outlet-cutlost-recommendations';
import { cutlostRequestTitle } from '@agency-portal/lib/outlet-cutlost-requests';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { Clock, Sparkles, TrendingDown, UserMinus } from 'lucide-react';
import { cn } from '@agency-portal/lib/utils';

function formatRm(amount: number): string {
  return `RM ${Math.round(amount).toLocaleString('en-MY')}`;
}

function formatCutLossSavings(savings: number, cutLoss: number): string | null {
  if (savings <= 0) return null;
  if (cutLoss > 0 && savings >= cutLoss - 1) return 'Clears cutlost';
  return `−${formatRm(savings)}`;
}

export const OUTLET_OPEN_CUTLOST_EVENT = 'outlet:open-cutlost';

export function OutletCutLossActions({
  shift,
  className,
  sectionId = OUTLET_REDUCE_CUTLOST_SECTION_ID,
}: {
  shift: ShiftRequest;
  className?: string;
  /** DOM id for scroll targets — unique per shift when inline in a list. */
  sectionId?: string;
}) {
  const outletWorkspace = useStore((s) => s.outletWorkspace);
  const agencyPRs = useStore((s) => s.agencyPRs);
  const pendingCutlostRequests = useStore((s) => s.pendingCutlostRequests);
  const requestOutletCutlostReduction = useStore(
    (s) => s.requestOutletCutlostReduction,
  );

  const tierRates = resolveShiftTierRates(shift, outletWorkspace);
  const prTierById = Object.fromEntries(
    agencyPRs.map((pr) => [pr.id, pr.trainingLevel]),
  );
  const cutLoss = outletShiftCutLossForShift(shift, tierRates, prTierById);
  const unusedWages = outletShiftReleasedUnusedWagesTotal(
    shift,
    tierRates,
    prTierById,
  );
  const savedCredited = outletShiftBestEffortSaveCredited(
    shift,
    tierRates,
    prTierById,
  );

  const [bestEffortOpen, setBestEffortOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { demand, supplied, openSlots } = outletShiftDemandSupplied(shift);
  const adjustments = outletShiftCutLossAdjustmentsLabel(shift);
  const perSlotLabor = outletShiftPlannedLaborPerSlot(
    shift,
    tierRates,
    prTierById,
  );
  const releaseAtClock = outletPlanningReleaseClock(shift.shift);

  useEffect(() => {
    const openFromChip = (event: Event) => {
      const targetId = (event as CustomEvent<{ sectionId?: string }>).detail
        ?.sectionId;
      if (!targetId || targetId === sectionId) setOpen(true);
    };
    window.addEventListener(OUTLET_OPEN_CUTLOST_EVENT, openFromChip);
    return () =>
      window.removeEventListener(OUTLET_OPEN_CUTLOST_EVENT, openFromChip);
  }, [sectionId]);

  const pendingRequest = useMemo(
    () =>
      pendingCutlostRequests.find(
        (r) => r.shiftId === shift.id && r.status === 'pending',
      ),
    [pendingCutlostRequests, shift.id],
  );

  const cutSlotsLabor = Math.round(perSlotLabor * openSlots);
  const cutAllSavings = outletShiftCutLossSavings(
    shift,
    tierRates,
    prTierById,
    {
      demandCut: (shift.demandCut ?? 0) + openSlots,
    },
  );

  const bestEffortPlan = useMemo(
    () =>
      recommendBestEffortCutlost({
        shift,
        tierRates,
        prTierById,
        agencyPRs,
        releaseAtClock,
      }),
    [shift, tierRates, prTierById, agencyPRs, releaseAtClock],
  );

  if (shift.status !== 'confirmed') return null;

  const canCutUnfilled = openSlots > 0;
  const hasBestEffort = Boolean(
    bestEffortPlan && bestEffortPlan.estimatedSavings > 0,
  );
  const hasActions = canCutUnfilled || hasBestEffort;
  const actionsLocked = Boolean(pendingRequest);

  if (!hasActions && cutLoss <= 0 && savedCredited <= 0 && !pendingRequest)
    return null;

  const submitBestEffort = () => {
    if (!bestEffortPlan) return;
    requestOutletCutlostReduction(shift.id, {
      kind: 'best_effort',
      prIds: bestEffortPlan.prIds,
      slotsCut: bestEffortPlan.slotsCut,
      rationale: bestEffortPlan.rationale,
    });
    setBestEffortOpen(false);
  };

  const submitCutSlots = () => {
    requestOutletCutlostReduction(shift.id, {
      kind: 'cut_slots',
      slots: openSlots,
    });
  };

  const bestEffortPct = Math.round(
    OUTLET_CUTLOSS_BEST_EFFORT_UNUSED_SHARE * 100,
  );
  const cutlostHint =
    cutLoss > 0
      ? `${formatRm(cutLoss)} underfill cutlost · ${openSlots} open of ${demand} requested`
      : savedCredited > 0
        ? `No underfill · ${formatRm(savedCredited)} best-effort save (${bestEffortPct}% of ${formatRm(unusedWages)} unused)`
        : 'Cut open slots or release PRs early (best effort)';

  return (
    <>
      <OutletSection
        id={sectionId}
        title="Reduce cutlost"
        hint={cutlostHint}
        collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn('iz-outlet-cutlost-section !mt-2.5', className)}
        trailing={
          <span className="flex items-center gap-1.5">
            {cutLoss > 0 && (
              <IzPill variant="red" className="shrink-0 !py-0.5 !text-[11px]">
                {formatRm(cutLoss)}
              </IzPill>
            )}
            {savedCredited > 0 && (
              <IzPill variant="green" className="shrink-0 !py-0.5 !text-[11px]">
                Saved {formatRm(savedCredited)}
              </IzPill>
            )}
            {pendingRequest && (
              <IzPill variant="amber" className="shrink-0 !py-0.5 !text-[11px]">
                Pending agency
              </IzPill>
            )}
          </span>
        }
      >
        <p className="text-xs leading-snug text-[var(--iz-muted2)]">
          Cutlost is planned wages for open (unfilled) seats only. Early
          releases pay exact hours worked; commissions stay separate. Best
          effort recovers {bestEffortPct}% of unused wages as savings — that
          does not add to cutlost. Reductions need agency approval.
        </p>

        {pendingRequest && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-[rgba(244,183,64,.28)] bg-[rgba(244,183,64,.08)] px-2.5 py-2 text-xs text-[var(--iz-amber)]">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Awaiting agency · {cutlostRequestTitle(pendingRequest)} · ~
            {formatRm(pendingRequest.estimatedSavings)} savings
          </p>
        )}

        {adjustments && (
          <p className="mt-1 text-xs text-[var(--iz-muted2)]">
            Already applied · {adjustments}
          </p>
        )}

        <div className="mt-1.5 space-y-1">
          {canCutUnfilled && (
            <ActionRow
              icon={TrendingDown}
              title={
                openSlots === 1
                  ? 'Cut 1 open slot'
                  : `Cut ${openSlots} open slots`
              }
              detail={`~${formatRm(cutSlotsLabor)} off planned labor · ${openSlots} unfilled of ${demand} requested`}
              savingsLabel={formatCutLossSavings(cutAllSavings, cutLoss)}
              disabled={actionsLocked}
              onClick={submitCutSlots}
            />
          )}

          <ModelRow
            icon={Sparkles}
            title="Best Effort Cut-Lost"
            detail={
              supplied > 0
                ? `Release PRs early — pay hours worked; outlet keeps ${bestEffortPct}% of unused wages (${supplied} on shift).`
                : `Release PRs early — pay hours worked; outlet keeps ${bestEffortPct}% of unused wages.`
            }
            savingsLabel={
              bestEffortPlan
                ? formatCutLossSavings(bestEffortPlan.estimatedSavings, cutLoss)
                : null
            }
            active={bestEffortOpen}
            disabled={actionsLocked || !hasBestEffort}
            onClick={() => setBestEffortOpen(true)}
          />
        </div>
      </OutletSection>

      <IzSheet open={bestEffortOpen} onClose={() => setBestEffortOpen(false)}>
        <IzCardTitle className="flex items-center gap-2">
          Best Effort Cut-Lost
        </IzCardTitle>
        <p className="iz-tiny iz-muted mt-1">
          Optimized for {shift.event} — release PRs at current time (
          {releaseAtClock}). They are paid for hours worked plus commissions;
          unused wage share ({bestEffortPct}%) is estimated savings. If not
          reassigned by agency, they are sent home.
        </p>
        {bestEffortPlan ? (
          <>
            <p className="mt-4 font-sora text-2xl font-bold tabular-nums text-[var(--iz-green)]">
              {formatCutLossSavings(bestEffortPlan.estimatedSavings, cutLoss) ??
                formatRm(0)}
            </p>
            <p className="iz-tiny iz-muted2 mt-0.5">
              ~{formatRm(bestEffortPlan.estimatedSavings)} save ({bestEffortPct}
              % of {formatRm(bestEffortPlan.unusedWages)} unused wages)
            </p>
            <div className="mt-4 space-y-2 rounded-xl border border-[var(--iz-line)] bg-white/[0.02] p-3">
              {bestEffortPlan.prNames.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <UserMinus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-gold)]" />
                  <span>Release {bestEffortPlan.prNames.join(', ')} early</span>
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
                Why this mix
              </p>
              {bestEffortPlan.rationale.map((line) => (
                <p
                  key={line}
                  className="text-xs leading-snug text-[var(--iz-muted2)]"
                >
                  · {line}
                </p>
              ))}
            </div>
            <button
              type="button"
              className="iz-btn iz-btn-primary mt-4 w-full"
              disabled={actionsLocked}
              onClick={submitBestEffort}
            >
              Request agency approval
            </button>
          </>
        ) : (
          <p className="iz-tiny iz-muted mt-4 text-center leading-snug">
            No early-release savings plan could be calculated for this shift
            right now.
          </p>
        )}
        <button
          type="button"
          className="iz-btn iz-btn-soft mt-2 w-full"
          onClick={() => setBestEffortOpen(false)}
        >
          Cancel
        </button>
      </IzSheet>
    </>
  );
}

function ModelRow({
  icon: Icon,
  title,
  detail,
  savingsLabel,
  active,
  disabled,
  onClick,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
  savingsLabel?: string | null;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
        active
          ? 'border-[var(--iz-gold-d)] bg-[var(--iz-gold)]/8'
          : 'border-[var(--iz-line)] bg-[var(--iz-bg)]',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-[var(--iz-gold-d)]',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon className="h-4 w-4 text-[var(--iz-gold)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--iz-muted2)]">
          {detail}
        </span>
      </span>
      {savingsLabel && (
        <span className="shrink-0 text-xs font-semibold leading-tight text-[var(--iz-green)]">
          {savingsLabel}
        </span>
      )}
    </button>
  );
}

function ActionRow({
  icon: Icon,
  title,
  detail,
  savingsLabel,
  disabled,
  onClick,
}: {
  icon: typeof UserMinus;
  title: string;
  detail: string;
  savingsLabel?: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg)] px-2.5 py-1.5 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-[var(--iz-gold-d)]',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon className="h-4 w-4 text-[var(--iz-gold)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--iz-muted2)]">
          {detail}
        </span>
      </span>
      {savingsLabel && (
        <span className="shrink-0 text-xs font-semibold leading-tight text-[var(--iz-green)]">
          {savingsLabel}
        </span>
      )}
    </button>
  );
}
