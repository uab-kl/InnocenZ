import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore, type ShiftRequest } from '@agency-portal/lib/store';
import { outletCan } from '@agency-portal/lib/outlet-rbac';
import { IzPill } from '@agency-portal/components/iz/ui';
import { OutletShiftSalesPanel } from '@agency-portal/components/outlet/OutletLogSales';
// import { OutletSealReview } from "@agency-portal/components/outlet/OutletSealReview";
import {
  OutletCutLossActions,
  OUTLET_OPEN_CUTLOST_EVENT,
} from '@agency-portal/components/outlet/OutletCutLossActions';
import { WorkspaceTierRatesEditor } from '@agency-portal/components/outlet/WorkspaceTierRatesEditor';
import {
  OutletActionButton,
  OutletApplicantRow,
  OutletStatChip,
  OutletTargetActualCard,
} from '@agency-portal/components/outlet/outlet-portal-ui';
import {
  formatShiftDrinkPricingSummary,
  formatShiftEventTypeSummary,
  formatOutletPriceRm,
  OUTLET_PR_TONIGHT_SECTION_ID,
  OUTLET_REDUCE_CUTLOST_SECTION_ID,
  OUTLET_SERVICE_ENTITLEMENT_SECTION_ID,
  scrollToOutletLaborCostReport,
  scrollToOutletLiveSales,
  shiftSpecialEventLabel,
  outletShiftCutLossAdjustmentsLabel,
  outletShiftCutLossForShift,
  outletShiftBestEffortSaveCredited,
  outletShiftDemandSupplied,
  outletShiftActivePrIds,
  outletShiftActualLaborCostForShift,
  outletShiftTargetLaborCost,
  outletShiftTargetSalesForShift,
  resolveShiftTierRates,
  shiftDrinkMenuDetailLines,
  formatOutletShiftMetricAmount,
} from '@agency-portal/lib/outlet-demo';
import { outletShiftDisplayLiveSales } from '@agency-portal/lib/outlet-financial-sync';
import { resolveOutletShiftDateIso } from '@agency-portal/lib/agency-outlet-shifts';
import { outletMatches } from '@agency-portal/lib/portal-sync';
import { specialServicesForOutlet } from '@agency-portal/lib/special-service-actions';
import { shiftTierStaffingByPayTier } from '@agency-portal/lib/post-job-pay-tiers';
import { getLiveTodayIso } from '@agency-portal/lib/demo-clock';
import { trafficLevelForRatio } from '@agency-portal/lib/traffic-status';
import {
  Check,
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import { cn } from '@agency-portal/lib/utils';

const STATUS_META = {
  sealed: { tone: 'iz-pill-ink', icon: Lock, label: 'Sealed' },
  confirmed: { tone: 'iz-pill-green', icon: CheckCircle2, label: 'Live' },
  open: { tone: 'iz-pill-amber', icon: PlayCircle, label: 'Open' },
  draft: { tone: 'iz-pill-violet', icon: Clock, label: 'Draft' },
} as const;

export function OutletShiftStatusBadge({ shift }: { shift: ShiftRequest }) {
  const meta = STATUS_META[shift.status] ?? STATUS_META.draft;
  const StatusIcon = meta.icon;
  return (
    <span className={cn('iz-pill shrink-0 !py-0.5 !text-[9px]', meta.tone)}>
      <StatusIcon className="mr-0.5 inline h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

export function OutletShiftDetailPanel({
  shift,
  variant = 'future',
  hideLogSales = false,
  hideCutlost = false,
  staffingAgency,
}: {
  shift: ShiftRequest;
  variant?: 'home' | 'future';
  hideLogSales?: boolean;
  /** Home page renders cutlost at page bottom — hide inline block here. */
  hideCutlost?: boolean;
  /** When set, show linked agency instead of destination labels. */
  staffingAgency?: string;
}) {
  const outletSubRole = useStore((s) => s.outletSubRole);
  const outletWorkspace = useStore((s) => s.outletWorkspace);
  const agencyPRs = useStore((s) => s.agencyPRs);
  const agencyRoster = useStore((s) => s.agencyRoster);
  const prReceiptScans = useStore((s) => s.prReceiptScans);
  const specialServiceOrders = useStore((s) => s.specialServiceOrders);
  const { confirmShift, /* sealShift, */ shiftApplicants, respondToApplicant } =
    useStore();

  const canLogSales = outletCan(outletSubRole, 'logSales');
  const canConfirm = outletCan(outletSubRole, 'confirmShift');
  // const canSeal = outletCan(outletSubRole, "sealShift");
  const canStaff = outletCan(outletSubRole, 'manageShiftStaffing');

  // const [sealOpen, setSealOpen] = useState(false);

  const showApplicantActions = variant !== 'future';
  const todayIso = getLiveTodayIso();
  const shiftDateIso = resolveOutletShiftDateIso(
    shift.date,
    shift.dateIso,
    todayIso,
  );
  const showCutlost = variant === 'home' || shiftDateIso === todayIso;
  const applicants = shiftApplicants.filter(
    (a) => a.shiftId === shift.id && a.status === 'pending',
  );
  const outletRequests = applicants.filter(
    (a) => a.source === 'outlet_request',
  );
  const selfApplicants = applicants.filter(
    (a) => a.source !== 'outlet_request',
  );
  const visibleApplicants = showApplicantActions
    ? selfApplicants
    : outletRequests;

  const drinkLines = shiftDrinkMenuDetailLines(
    shift,
    outletWorkspace.drinkMenu ?? [],
  );
  const eventTypeLabel = formatShiftEventTypeSummary(
    shift.eventKind ?? 'normal',
    shift.specialEventType,
    shift.customSpecialEventName,
  );
  const drinkPricingLabel = formatShiftDrinkPricingSummary(
    shift,
    outletWorkspace.drinkMenu ?? [],
  );
  const tierRates = resolveShiftTierRates(shift, outletWorkspace);
  const prTierById = Object.fromEntries(
    agencyPRs.map((pr) => [pr.id, pr.trainingLevel]),
  );
  const targetSales = outletShiftTargetSalesForShift(shift, tierRates);
  const targetCost = outletShiftTargetLaborCost(shift, tierRates, prTierById);
  const actualCost = outletShiftActualLaborCostForShift(
    shift,
    tierRates,
    prTierById,
  );
  const rosterTonight = useMemo(
    () =>
      agencyRoster.filter(
        (slot) =>
          outletMatches(slot.outlet, shift.outletName) &&
          slot.dateIso === shiftDateIso &&
          (shift.prs ?? []).includes(slot.prId),
      ),
    [agencyRoster, shift.outletName, shiftDateIso, shift.prs],
  );
  const tonightSpecialServiceRm = useMemo(
    () =>
      specialServicesForOutlet(specialServiceOrders, shift.outletName)
        .filter(
          (r) =>
            r.dateIso === shiftDateIso &&
            r.status !== 'declined' &&
            r.status !== 'rejected',
        )
        .reduce((sum, r) => sum + r.amountIn, 0),
    [specialServiceOrders, shift.outletName, shiftDateIso],
  );
  const displaySales = useMemo(
    () =>
      outletShiftDisplayLiveSales(
        shift,
        hideCutlost
          ? {
              outletName: shift.outletName,
              drinkMenu: outletWorkspace.drinkMenu ?? [],
              rosterSlots: rosterTonight,
              receiptScans: prReceiptScans,
              specialServiceRm: tonightSpecialServiceRm,
            }
          : undefined,
      ),
    [
      shift,
      hideCutlost,
      outletWorkspace.drinkMenu,
      rosterTonight,
      prReceiptScans,
      tonightSpecialServiceRm,
    ],
  );
  const cutLoss = outletShiftCutLossForShift(shift, tierRates, prTierById);
  const bestEffortSaved = outletShiftBestEffortSaveCredited(
    shift,
    tierRates,
    prTierById,
  );
  const { demand: staffingDemand, supplied } = outletShiftDemandSupplied(shift);
  const adjustmentsLabel = outletShiftCutLossAdjustmentsLabel(shift);
  const tierStaffingByPayTier = useMemo(
    () =>
      shiftTierStaffingByPayTier({
        payTierRows: shift.payTierRows,
        quantity: shift.quantity,
        demandCut: shift.demandCut,
        releasedEarlyPrIds: shift.releasedEarlyPrIds,
        tierRates,
        bookedPrIds: outletShiftActivePrIds(shift),
        agencyPRs,
      }),
    [
      shift.payTierRows,
      shift.quantity,
      shift.demandCut,
      shift.releasedEarlyPrIds,
      shift.prs,
      tierRates,
      agencyPRs,
    ],
  );
  const demandLevel = trafficLevelForRatio(supplied, staffingDemand);
  const demandTone =
    demandLevel === 'green'
      ? 'green'
      : demandLevel === 'yellow'
        ? 'warn'
        : 'violet';
  const cutlostSectionId = hideCutlost
    ? OUTLET_REDUCE_CUTLOST_SECTION_ID
    : `${OUTLET_REDUCE_CUTLOST_SECTION_ID}-${shift.id}`;
  const scrollToCutlost = () => {
    window.dispatchEvent(
      new CustomEvent(OUTLET_OPEN_CUTLOST_EVENT, {
        detail: { sectionId: cutlostSectionId },
      }),
    );
    document
      .getElementById(cutlostSectionId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="px-3.5 pb-3.5 pt-2">
        {!staffingAgency && <p className="iz-tiny iz-muted2">{shift.shift}</p>}
        <div className={cn(!staffingAgency && 'mt-1', 'space-y-0.5')}>
          <p className="iz-tiny iz-muted2">
            <span className="text-[var(--iz-muted)]">Event type · </span>
            {eventTypeLabel}
          </p>
          <p className="iz-tiny iz-muted2">
            <Link
              to="/outlet/workspace"
              hash={OUTLET_SERVICE_ENTITLEMENT_SECTION_ID}
              className="text-[var(--iz-muted)] underline-offset-2 transition-colors hover:text-[var(--iz-txt)] hover:underline"
            >
              Service Entitlement
            </Link>
            <span className="text-[var(--iz-muted)]"> · </span>
            {drinkPricingLabel}
          </p>
          {shift.eventKind === 'special' && drinkLines.length > 0 && (
            <p className="iz-tiny iz-muted2 leading-relaxed">
              {drinkLines.map((d, i) => (
                <span key={d.name}>
                  {i > 0 ? ' · ' : null}
                  <span
                    className={d.changed ? 'text-[var(--iz-gold)]' : undefined}
                  >
                    {d.name} RM {formatOutletPriceRm(d.priceRm)}
                  </span>
                </span>
              ))}
            </p>
          )}
        </div>
        {(shift.dressCode || staffingAgency) && (
          <p className="iz-tiny iz-muted2 mt-0.5">
            {shift.dressCode && (
              <>
                <span className="text-[var(--iz-muted)]">Dress Code: </span>
                {shift.dressCode}
              </>
            )}
            {shift.dressCode && staffingAgency ? ' · ' : null}
            {staffingAgency}
          </p>
        )}

        <div className="mt-3">
          <div className="iz-outlet-shift-kpi-row">
            <OutletStatChip
              label="Demand / supplied"
              value={`${staffingDemand} / ${supplied}`}
              tone={demandTone}
              onClick={() => {
                document
                  .getElementById(OUTLET_PR_TONIGHT_SECTION_ID)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
            <OutletTargetActualCard
              label="Sales"
              target={targetSales}
              actual={displaySales}
              onClick={hideCutlost ? scrollToOutletLiveSales : undefined}
            />
            <OutletTargetActualCard
              label="Labor cost"
              target={targetCost}
              actual={actualCost}
              lowerIsBetter
              onClick={hideCutlost ? scrollToOutletLaborCostReport : undefined}
            />
            <OutletStatChip
              label="Cutlost"
              value={formatOutletShiftMetricAmount(cutLoss)}
              tone={cutLoss > 0 ? 'danger' : 'neutral'}
              onClick={scrollToCutlost}
            />
          </div>
        </div>

        {(adjustmentsLabel || bestEffortSaved > 0) && (
          <p className="iz-tiny iz-muted2 mt-2 text-center">
            Posted {shift.quantity}
            {adjustmentsLabel ? ` · ${adjustmentsLabel}` : ''}
            {bestEffortSaved > 0
              ? ` · Saved ${formatOutletShiftMetricAmount(bestEffortSaved)}`
              : ''}
          </p>
        )}

        {canStaff &&
          shift.status === 'confirmed' &&
          showCutlost &&
          !hideCutlost && (
            <OutletCutLossActions shift={shift} sectionId={cutlostSectionId} />
          )}

        <div className="mt-2.5">
          <WorkspaceTierRatesEditor
            tierRates={tierRates}
            commissionOnlyRates={outletWorkspace.commissionOnlyRates}
            onPatchTier={() => {}}
            onPatchCommissionOnly={() => {}}
            readOnly
            tierStaffingByPayTier={tierStaffingByPayTier}
          />
        </div>

        {canStaff &&
          visibleApplicants.length > 0 &&
          shift.status !== 'sealed' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--iz-muted2)]">
                  {showApplicantActions ? 'Applicants' : 'Requested PRs'}
                </p>
                <IzPill variant="amber" className="!py-0.5 !text-[9px]">
                  {visibleApplicants.length} waiting
                </IzPill>
              </div>
              {!showApplicantActions && (
                <p className="text-[10px] leading-snug text-[var(--iz-muted2)]">
                  Your agency approves or declines each request.
                </p>
              )}
              {visibleApplicants.map((a) =>
                showApplicantActions ? (
                  <OutletApplicantRow
                    key={a.id}
                    name={a.prName}
                    meta={
                      <IzPill variant="gold" className="!py-0.5 !text-[9px]">
                        {a.rating}★
                      </IzPill>
                    }
                    onAccept={() => respondToApplicant(a.id, true)}
                    onDecline={() => respondToApplicant(a.id, false)}
                  />
                ) : (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--iz-line2)] bg-white/[0.02] px-3 py-2"
                  >
                    <span className="text-xs">
                      {a.prName} · {a.rating}★
                    </span>
                    <IzPill variant="amber" className="!py-0.5 !text-[9px]">
                      Pending agency
                    </IzPill>
                  </div>
                ),
              )}
            </div>
          )}

        {canLogSales && shift.status === 'confirmed' && !hideLogSales && (
          <div className="mt-3">
            <OutletShiftSalesPanel
              shiftId={shift.id}
              label="Log sales"
              collapsible
            />
          </div>
        )}
        {canLogSales && shift.status === 'sealed' && (
          <p className="iz-tiny iz-muted mt-2">Sales locked after seal.</p>
        )}

        <div className="mt-3 space-y-2">
          {canConfirm &&
            showApplicantActions &&
            shift.status !== 'confirmed' &&
            shift.status !== 'sealed' && (
              <OutletActionButton
                icon={Check}
                title="Confirm staffing"
                hint="Lock in PRs and mark this shift live"
                tone="green"
                onClick={() => confirmShift(shift.id)}
              />
            )}
          {/* Seal shift — disabled until agency payroll link is wired
          {canSeal && shift.status === "confirmed" && (
            <OutletActionButton
              icon={Lock}
              title="Seal shift"
              hint="Finalize sales and send payroll to agencies"
              tone="gold"
              onClick={() => setSealOpen(true)}
            />
          )}
          */}
          {shift.status === 'sealed' && (
            <div className="flex justify-center py-1">
              <IzPill variant="green">Payroll sent · shift sealed</IzPill>
            </div>
          )}
        </div>
      </div>

      {/* <OutletSealReview
        shift={shift}
        open={sealOpen}
        onClose={() => setSealOpen(false)}
        onConfirm={() => {
          sealShift(shift.id);
          setSealOpen(false);
        }}
      /> */}
    </>
  );
}
