import { useMemo, type ReactNode } from 'react';
import { AgencyCommissionRulesPanel } from '@agency-portal/components/agency/AgencyCommissionRulesPanel';
import { WorkspaceTierRatesEditor } from '@agency-portal/components/outlet/WorkspaceTierRatesEditor';
import { formatOutletHistRm } from '@agency-portal/components/outlet/outlet-history-ui';
import { IzPill } from '@agency-portal/components/iz/ui';
import {
  formatTierSalesTargets,
  formatTierWageRange,
} from '@agency-portal/lib/agency-demo';
import {
  groupOutletShiftsTodayFuture,
  outletShiftEventTypeLabel,
  outletShiftIsSpecialEvent,
  outletShiftSourceLabel,
  summarizeOutletDemandTodayFuture,
  type AgencyOutletAvailableShift,
  type AgencyOutletDayDemand,
  type AgencyOutletSummary,
} from '@agency-portal/lib/agency-outlet-shifts';
import { outletShiftActivePrIds } from '@agency-portal/lib/outlet-demo';
import {
  formatPayTierRowsCompact,
  resolveShiftPayTierRows,
  shiftTierStaffingByPayTier,
} from '@agency-portal/lib/post-job-pay-tiers';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import { useStore } from '@agency-portal/lib/store';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  Star,
} from 'lucide-react';

type AgencyOutletDetailViewProps = {
  summary: AgencyOutletSummary;
  shifts: AgencyOutletAvailableShift[];
  dayDemand: AgencyOutletDayDemand[];
  onBack: () => void;
};

export function AgencyOutletDetailView({
  summary,
  shifts,
  dayDemand,
  onBack,
}: AgencyOutletDetailViewProps) {
  const shiftGroups = useMemo(
    () => groupOutletShiftsTodayFuture(shifts, DEFAULT_ROSTER_DATE_ISO),
    [shifts],
  );
  const demandOverview = useMemo(
    () => summarizeOutletDemandTodayFuture(dayDemand, DEFAULT_ROSTER_DATE_ISO),
    [dayDemand],
  );
  const todayOverview = demandOverview.find(
    (day) =>
      day.dateIso === DEFAULT_ROSTER_DATE_ISO || day.dateLabel === 'Today',
  );
  const futureOverview = demandOverview.find((day) => day.dateIso === 'future');

  return (
    <div className="iz-screen iz-outlet-detail-page">
      <button type="button" className="iz-outlet-detail-back" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        Back to outlets
      </button>

      <header className="iz-outlet-detail-head">
        <div className="iz-outlet-detail-head__icon" aria-hidden>
          <MapPin className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="iz-outlet-detail-head__title">{summary.outlet}</h1>
          <p className="iz-outlet-detail-head__meta">
            Wage RM{summary.rule.wagePerHour.toLocaleString('en-MY')}/shift ·
            Drinks {summary.rule.drinkPct}% · Tips {summary.rule.tipPct}%
          </p>
        </div>
      </header>

      <div className="iz-outlet-detail-kpi-row">
        <OutletDetailKpiCard
          label="Events"
          value={String(shifts.length)}
          tone="events"
        />
        <OutletDetailKpiCard
          label="Today"
          demand={todayOverview?.demand}
          supplied={todayOverview?.supplied}
          sub={
            todayOverview
              ? `${todayOverview.eventCount} event${todayOverview.eventCount !== 1 ? 's' : ''}${todayOverview.openSlots > 0 ? ` · ${todayOverview.openSlots} open` : ''}`
              : undefined
          }
          tone="today"
        />
        <OutletDetailKpiCard
          label="Future"
          demand={futureOverview?.demand}
          supplied={futureOverview?.supplied}
          sub={
            futureOverview
              ? `${futureOverview.eventCount} event${futureOverview.eventCount !== 1 ? 's' : ''}${futureOverview.openSlots > 0 ? ` · ${futureOverview.openSlots} open` : ''}`
              : undefined
          }
          tone="future"
        />
      </div>

      <section className="iz-outlet-detail-section">
        <div className="iz-outlet-detail-section__head">
          <h2 className="iz-outlet-detail-section__title">
            <Star className="h-4 w-4" aria-hidden />
            Rates by PR tier
          </h2>
          <span className="iz-outlet-detail-section__badge">
            Read-only on agency
          </span>
        </div>
        <AgencyCommissionRulesPanel outlet={summary.outlet} tableOnly />
      </section>

      <section className="iz-outlet-detail-section">
        <div className="iz-outlet-detail-section__head">
          <h2 className="iz-outlet-detail-section__title">
            <Briefcase className="h-4 w-4" aria-hidden />
            Available shifts
          </h2>
        </div>
        <p className="iz-outlet-detail-section__hint">
          {shifts.length} listing{shifts.length !== 1 ? 's' : ''} · today and
          future
        </p>

        {shifts.length === 0 ? (
          <div className="iz-outlet-detail-empty">
            No open shifts match your filters.
          </div>
        ) : (
          <div className="iz-outlet-detail-shift-groups">
            {shiftGroups.map((group) => (
              <div key={group.dateIso} className="iz-outlet-detail-shift-group">
                <div className="iz-outlet-detail-group-head">
                  <span className="iz-outlet-detail-group-head__label">
                    {group.dateLabel}
                  </span>
                  <div className="iz-outlet-detail-group-head__stats">
                    <span className="iz-outlet-detail-group-head__stats-label">
                      Demand / supplied
                    </span>
                    <span className="iz-outlet-detail-group-head__stats-value">
                      {group.demand}
                      <span className="iz-outlet-detail-group-head__stats-sep">
                        /
                      </span>
                      <span className="iz-outlet-detail-group-head__stats-supplied">
                        {group.supplied}
                      </span>
                      {group.openSlots > 0 && (
                        <span className="iz-outlet-detail-group-head__stats-open">
                          · {group.openSlots} open
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="iz-outlet-detail-shift-list">
                  {group.shifts.map((shift) =>
                    group.dateIso === 'future' ? (
                      <OutletDetailFutureShiftCard
                        key={shift.id}
                        shift={shift}
                      />
                    ) : (
                      <OutletDetailTodayShiftCard
                        key={shift.id}
                        shift={shift}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OutletDetailKpiCard({
  label,
  value,
  demand,
  supplied,
  sub,
  tone,
}: {
  label: string;
  value?: string;
  demand?: number;
  supplied?: number;
  sub?: string;
  tone: 'events' | 'today' | 'future';
}) {
  const hasRatio =
    demand != null && supplied != null && (demand > 0 || supplied > 0);

  return (
    <article className={`iz-outlet-detail-kpi iz-outlet-detail-kpi--${tone}`}>
      <p className="iz-outlet-detail-kpi__label">{label}</p>
      {value != null ? (
        <p className="iz-outlet-detail-kpi__value iz-outlet-detail-kpi__value--solo">
          {value}
        </p>
      ) : hasRatio ? (
        <p className="iz-outlet-detail-kpi__value">
          {demand}
          <span className="iz-outlet-detail-kpi__sep">/</span>
          <span className="iz-outlet-detail-kpi__supplied">{supplied}</span>
        </p>
      ) : (
        <p className="iz-outlet-detail-kpi__value iz-outlet-detail-kpi__value--solo">
          —
        </p>
      )}
      {sub && <p className="iz-outlet-detail-kpi__sub">{sub}</p>}
    </article>
  );
}

function OutletShiftMetric({
  label,
  tone,
  title,
  children,
}: {
  label: string;
  tone: 'gold' | 'violet' | 'ink' | 'demand';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`iz-outlet-detail-metric iz-outlet-detail-metric--${tone}`}
      title={title}
    >
      <span className="iz-outlet-detail-metric__label">{label}</span>
      <div className="iz-outlet-detail-metric__value">{children}</div>
    </div>
  );
}

function OutletDemandSuppliedStat({
  demand,
  supplied,
  openSlots,
}: {
  demand: number;
  supplied: number;
  openSlots?: number;
}) {
  return (
    <div className="iz-outlet-detail-metric iz-outlet-detail-metric--demand">
      <span className="iz-outlet-detail-metric__label">Demand / supplied</span>
      <span className="iz-outlet-detail-metric__nums">
        <span>{demand}</span>
        <span className="iz-outlet-detail-metric__sep">/</span>
        <span className="iz-outlet-detail-metric__supplied">{supplied}</span>
      </span>
      {openSlots != null && openSlots > 0 && (
        <span className="iz-outlet-detail-metric__open">
          {openSlots} open slots
        </span>
      )}
    </div>
  );
}

function OutletShiftTierRequestTable({
  shift,
}: {
  shift: AgencyOutletAvailableShift;
}) {
  const shifts = useStore((s) => s.shifts);
  const agencyPRs = useStore((s) => s.agencyPRs);
  const outletWorkspace = useStore((s) => s.outletWorkspace);

  const tierStaffingByPayTier = useMemo(() => {
    const postedShiftId =
      shift.source === 'posted' && shift.id.startsWith('posted-')
        ? shift.id.slice('posted-'.length)
        : shift.linkedShiftId;
    const postedShift = postedShiftId
      ? shifts.find((s) => s.id === postedShiftId)
      : undefined;
    const bookedPrIds = postedShift ? outletShiftActivePrIds(postedShift) : [];
    return shiftTierStaffingByPayTier({
      payTierRows: shift.payTierRows,
      quantity: shift.quantity,
      demandCut: postedShift?.demandCut,
      releasedEarlyPrIds: postedShift?.releasedEarlyPrIds,
      tierRates: shift.tierRates,
      bookedPrIds,
      agencyPRs,
    });
  }, [
    shift.payTierRows,
    shift.quantity,
    shift.tierRates,
    shift.id,
    shift.source,
    shift.linkedShiftId,
    shifts,
    agencyPRs,
  ]);

  const hasAnyDemand = Object.values(tierStaffingByPayTier).some(
    (row) => row.demand > 0,
  );
  if (!hasAnyDemand) return null;

  return (
    <div className="iz-outlet-detail-pay-tiers">
      <p className="iz-outlet-detail-pay-tiers__label">Pay & tiers</p>
      <WorkspaceTierRatesEditor
        tierRates={shift.tierRates}
        commissionOnlyRates={outletWorkspace.commissionOnlyRates}
        onPatchTier={() => {}}
        onPatchCommissionOnly={() => {}}
        readOnly
        tierStaffingByPayTier={tierStaffingByPayTier}
      />
    </div>
  );
}

function ShiftSourceBadge({ shift }: { shift: AgencyOutletAvailableShift }) {
  if (shift.source === 'tied-offer') {
    return (
      <IzPill variant="violet" className="iz-outlet-detail-shift-badge">
        Agency offer
      </IzPill>
    );
  }
  return (
    <span className="iz-outlet-detail-shift-source">
      {outletShiftSourceLabel(shift.source)}
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

function OutletShiftCardDetails({
  shift,
  showBriefingInSummary = false,
}: {
  shift: AgencyOutletAvailableShift;
  showBriefingInSummary?: boolean;
}) {
  const eventType = outletShiftEventTypeLabel(shift);
  const isSpecialEvent = outletShiftIsSpecialEvent(shift);

  return (
    <>
      <div className="iz-outlet-detail-shift-card__metrics">
        <OutletDemandSuppliedStat
          demand={shift.demandSlots}
          supplied={shift.suppliedSlots}
          openSlots={shift.openSlots}
        />
        <OutletShiftMetric label="Est. payout" tone="gold">
          {formatOutletHistRm(shift.payEstimate)}
        </OutletShiftMetric>
        <OutletShiftMetric
          label="Event type"
          tone={isSpecialEvent ? 'gold' : 'ink'}
          title={eventType}
        >
          {eventType}
        </OutletShiftMetric>
      </div>

      {showBriefingInSummary && shift.briefing && (
        <div className="iz-outlet-detail-shift-note iz-outlet-detail-shift-note--inline">
          {shift.briefing}
        </div>
      )}
    </>
  );
}

function OutletShiftTierPreview({
  shift,
}: {
  shift: AgencyOutletAvailableShift;
}) {
  const tierRequest = formatPayTierRowsCompact(
    resolveShiftPayTierRows({
      payTierRows: shift.payTierRows,
      quantity: shift.quantity,
      tierRates: shift.tierRates,
    }),
  );
  const targetPay = formatTierWageRange(shift.tierRates);
  const salesTargets = formatTierSalesTargets(shift.tierRates);
  const line = [tierRequest, targetPay, salesTargets]
    .filter(Boolean)
    .join(' · ');
  if (!line) return null;

  return (
    <p className="iz-outlet-detail-shift-card__preview group-open:hidden">
      {line}
    </p>
  );
}

function OutletDetailTodayShiftCard({
  shift,
}: {
  shift: AgencyOutletAvailableShift;
}) {
  return (
    <details className="iz-outlet-detail-shift-card group">
      <summary>
        <div className="iz-outlet-detail-shift-card__main">
          <div className="iz-outlet-detail-shift-card__top">
            <div className="min-w-0 flex-1">
              <p className="iz-outlet-detail-shift-card__title">
                {shift.event}
              </p>
              <div className="iz-outlet-detail-shift-card__when">
                <span>
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  {shift.date}
                </span>
                <span>
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {shift.shift}
                </span>
              </div>
            </div>
            <ShiftSourceBadge shift={shift} />
          </div>

          <OutletShiftCardDetails shift={shift} showBriefingInSummary />
          <OutletShiftTierPreview shift={shift} />
        </div>
        <ChevronDown
          className="iz-outlet-detail-shift-card__chevron"
          aria-hidden
        />
      </summary>

      <div className="iz-outlet-detail-shift-card__body">
        {shift.languages && (
          <p className="iz-outlet-detail-shift-meta">
            Languages · {shift.languages}
          </p>
        )}
        <OutletShiftTierRequestTable shift={shift} />
      </div>
    </details>
  );
}

function OutletDetailFutureShiftCard({
  shift,
}: {
  shift: AgencyOutletAvailableShift;
}) {
  return (
    <details className="iz-outlet-detail-shift-card iz-outlet-detail-shift-card--future group">
      <summary>
        <div className="iz-outlet-detail-shift-card__main">
          <div className="iz-outlet-detail-shift-future__head">
            <div className="min-w-0 flex-1">
              <p className="iz-outlet-detail-shift-card__title">
                {shift.event}
              </p>
              <p className="iz-outlet-detail-shift-future__sub">
                {shift.date} · {shift.shift} · {shift.demandSlots}/
                {shift.suppliedSlots}
                {shift.openSlots > 0 ? ` · ${shift.openSlots} open` : ''}
              </p>
            </div>
            <div className="iz-outlet-detail-shift-future__aside">
              <p className="iz-outlet-detail-shift-future__pay">
                {formatOutletHistRm(shift.payEstimate)}
              </p>
              <span className="iz-outlet-detail-shift-future__action">
                {outletShiftSourceLabel(shift.source)}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          </div>

          <OutletShiftCardDetails shift={shift} showBriefingInSummary />
          <OutletShiftTierPreview shift={shift} />
        </div>
        <ChevronDown
          className="iz-outlet-detail-shift-card__chevron"
          aria-hidden
        />
      </summary>

      <div className="iz-outlet-detail-shift-card__body">
        {shift.languages && (
          <p className="iz-outlet-detail-shift-meta">
            Languages · {shift.languages}
          </p>
        )}
        <OutletShiftTierRequestTable shift={shift} />
      </div>
    </details>
  );
}
