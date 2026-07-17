import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { AgencyGpsPanel } from '@agency-portal/components/agency/AgencyGpsPanel';
import { RosterTimetableFilters } from '@agency-portal/components/agency/RosterTimetableFilters';
import { RosterWeeklyTimetable } from '@agency-portal/components/agency/RosterWeeklyTimetable';
import { RosterPlanningDatePicker } from '@agency-portal/components/agency/RosterPlanningDatePicker';
import { RosterShiftFilters } from '@agency-portal/components/agency/RosterShiftFilters';
import {
  RosterShiftTable,
  rosterSlotDisplayPayout,
} from '@agency-portal/components/agency/RosterShiftTable';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { useStore } from '@agency-portal/lib/store';
import { useRosterSlots } from '@agency-portal/hooks/use-roster-slots';
import {
  assignmentStatusFromRoster,
  useRosterMutations,
} from '@agency-portal/hooks/use-roster-mutations';
import {
  OUTLET_NAMES,
  rosterPageDisplayStatus,
  rosterSlotsForAgency,
  scopeToAgency,
  type AgencyRosterSlot,
  type RosterSlotStatus,
} from '@agency-portal/lib/agency-demo';
import { listEarlyReleasedPrsForReassign } from '@agency-portal/lib/outlet-demo';
import { parseShiftWindow } from '@agency-portal/lib/portal-sync';
import type { RosterShiftEarningsContext } from '@agency-portal/lib/outlet-financial-sync';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import {
  LabelWithIcon,
  TitleWithIcon,
} from '@agency-portal/components/iz/TitleWithIcon';
import {
  IzCard,
  IzCardTitle,
  IzPill,
  IzSelect,
  IzTimeInput,
  formatRM,
} from '@agency-portal/components/iz/ui';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import {
  EMPTY_ROSTER_SHIFT_FILTERS,
  EMPTY_ROSTER_TIMETABLE_FILTERS,
  countTimetableMatchingSlots,
  filterRosterShifts,
  filterTimetablePrs,
  type RosterShiftFilterState,
  type RosterTimetableFilterState,
} from '@agency-portal/lib/roster-shift-filters';
import { getPrScheduleState } from '@agency-portal/lib/roster-availability';
import { agencyCan } from '@agency-portal/lib/agency-rbac';
import {
  mondayOfWeek,
  weekDayIsos,
  dedupeLiveRosterByPr,
} from '@agency-portal/lib/roster-week-plan';
import {
  listAvailableShiftsForEarlyReleaseReassign,
  type AgencyOutletAvailableShift,
} from '@agency-portal/lib/agency-outlet-shifts';
import {
  ArrowLeftRight,
  Calendar,
  ChevronRight,
  MapPin,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const EDITABLE_STATUSES: RosterSlotStatus[] = [
  'scheduled',
  'on-duty',
  'unavailable',
];

const STATUS_LABEL: Record<
  RosterSlotStatus,
  { label: string; variant: 'green' | 'amber' | 'red' | 'violet' | 'ink' }
> = {
  'on-duty': { label: 'On duty', variant: 'green' },
  'en-route': { label: 'Scheduled', variant: 'ink' },
  scheduled: { label: 'Scheduled', variant: 'ink' },
  unavailable: { label: 'Unavailable', variant: 'red' },
  'swap-pending': { label: 'Swap pending', variant: 'violet' },
  'assignment-pending': { label: 'Awaiting PR', variant: 'amber' },
  'outlet-request-pending': { label: 'Outlet request', variant: 'amber' },
  'outlet-pending': { label: 'Awaiting outlet', variant: 'amber' },
};

type ViewMode = 'live' | 'planning';

export const Route = createFileRoute('/agency/roster')({
  validateSearch: (search: Record<string, unknown>): { view?: ViewMode } =>
    search.view === 'planning' ? { view: 'planning' } : {},
  component: AgencyRoster,
});

function AgencyRoster() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { view } = Route.useSearch();
  const viewMode: ViewMode = view ?? 'live';
  const setViewMode = (next: ViewMode) =>
    navigate({ search: next === 'live' ? {} : { view: next } });
  const allAgencyRoster = useStore((s) => s.agencyRoster);
  const allAgencyPRs = useStore((s) => s.agencyPRs);
  const activeAgencyId = useStore((s) => s.activeAgencyId);
  const agencyPRs = useMemo(
    () => scopeToAgency(allAgencyPRs, activeAgencyId),
    [allAgencyPRs, activeAgencyId],
  );
  const [planningDate, setPlanningDate] = useState(DEFAULT_ROSTER_DATE_ISO);
  const weekStartIso = mondayOfWeek(planningDate);
  const weekDays = useMemo(() => weekDayIsos(weekStartIso), [weekStartIso]);
  // Planning view reads live backend data; live view keeps the demo store.
  const backendRoster = useRosterSlots({
    fromDate: weekStartIso,
    toDate: weekDays[weekDays.length - 1] ?? weekStartIso,
  });
  const demoAgencyRoster = useMemo(
    () => rosterSlotsForAgency(allAgencyRoster, allAgencyPRs, activeAgencyId),
    [allAgencyRoster, allAgencyPRs, activeAgencyId],
  );
  const agencyRoster =
    viewMode === 'planning' ? backendRoster.slots : demoAgencyRoster;
  const prCheckInMeta = useStore((s) => s.prCheckInMeta);
  const prSubRole = useStore((s) => s.prSubRole);
  const editRosterSlot = useStore((s) => s.editRosterSlot);
  const cancelRosterShift = useStore((s) => s.cancelRosterShift);
  const requestOutletSwap = useStore((s) => s.requestOutletSwap);
  const agencySubRole = useStore((s) => s.agencySubRole);
  const prSwapRequests = useStore((s) => s.prSwapRequests);
  const approvePrSwapRequest = useStore((s) => s.approvePrSwapRequest);
  const declinePrSwapRequest = useStore((s) => s.declinePrSwapRequest);
  const demoAutoAssignPr = useStore((s) => s.demoAutoAssignPr);
  const assignPrToOutlet = useStore((s) => s.assignPrToOutlet);
  const flagRosterAttendance = useStore((s) => s.flagRosterAttendance);
  const syncLivePrCheckInToRoster = useStore(
    (s) => s.syncLivePrCheckInToRoster,
  );
  const syncOutletRequestRoster = useStore((s) => s.syncOutletRequestRoster);
  const [shiftFilters, setShiftFilters] = useState<RosterShiftFilterState>(
    EMPTY_ROSTER_SHIFT_FILTERS,
  );
  const [timetableFilters, setTimetableFilters] =
    useState<RosterTimetableFilterState>(EMPTY_ROSTER_TIMETABLE_FILTERS);
  const [editId, setEditId] = useState<string | null>(null);
  const [approveSwapId, setApproveSwapId] = useState<string | null>(null);
  const [replacementPick, setReplacementPick] = useState('');
  const canAssign = agencyCan(agencySubRole, 'assignShifts');

  // Phase 2: in planning view the by-id write actions hit the backend (a slot's
  // id is the shift-assignment id); the live view keeps its demo store actions.
  const rosterMut = useRosterMutations();
  const isPlanning = viewMode === 'planning';
  const handleCancelSlot = (slotId: string) =>
    isPlanning ? rosterMut.cancel.mutate(slotId) : cancelRosterShift(slotId);
  const handleFlagNoShow = (slotId: string) =>
    isPlanning
      ? rosterMut.flagNoShow.mutate(slotId)
      : flagRosterAttendance(slotId, 'no-show');
  const handleFlagLate = (slotId: string) => {
    // No backend field for 'late' yet; keep demo behaviour in live view only.
    if (!isPlanning) flagRosterAttendance(slotId, 'late');
  };
  const handleEditSave = (slotId: string, patch: Partial<AgencyRosterSlot>) => {
    if (isPlanning) {
      const status = patch.status
        ? assignmentStatusFromRoster(patch.status)
        : undefined;
      if (status) rosterMut.setStatus.mutate({ id: slotId, status });
      return;
    }
    editRosterSlot(slotId, patch);
  };

  useEffect(() => {
    syncLivePrCheckInToRoster();
  }, [syncLivePrCheckInToRoster, agencyRoster.length]);

  const dates = useMemo(
    () => [...new Set(agencyRoster.map((s) => s.dateIso))].sort(),
    [agencyRoster],
  );

  const liveDateIso = DEFAULT_ROSTER_DATE_ISO;

  const dateFiltered = useMemo(
    () =>
      dedupeLiveRosterByPr(
        agencyRoster.filter((s) => s.dateIso === liveDateIso),
      ),
    [agencyRoster, liveDateIso],
  );

  const filtered = useMemo(
    () =>
      [...filterRosterShifts(dateFiltered, shiftFilters)].sort((a, b) =>
        a.prName.localeCompare(b.prName, undefined, { sensitivity: 'base' }),
      ),
    [dateFiltered, shiftFilters],
  );

  const pendingPrSwaps = useMemo(
    () =>
      prSwapRequests.filter((s) => {
        if (s.status !== 'pending_agency' && s.status !== 'pending_replacement')
          return false;
        const slot = agencyRoster.find((r) => r.id === s.rosterSlotId);
        if (slot && slot.prId !== s.requestingPrId) return false;
        return true;
      }),
    [prSwapRequests, agencyRoster],
  );
  const outletRequestCount = agencyRoster.filter(
    (s) => s.status === 'outlet-request-pending',
  ).length;
  const swapCount = pendingPrSwaps.length;
  const swapToApprove = approveSwapId
    ? prSwapRequests.find(
        (s) => s.id === approveSwapId && s.status === 'pending_agency',
      )
    : null;
  const replacementCandidates = useMemo(
    () =>
      agencyPRs.filter(
        (p) =>
          !p.suspended && !p.detached && p.id !== swapToApprove?.requestingPrId,
      ),
    [agencyPRs, swapToApprove?.requestingPrId],
  );
  const editSlot = agencyRoster.find((s) => s.id === editId);

  const outletCommissionRules = useStore((s) => s.outletCommissionRules);
  const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
  const drinkMenu = useStore((s) => s.outletWorkspace.drinkMenu ?? []);
  const prReceiptScans = useStore((s) => s.prReceiptScans ?? []);
  const outletWorkspace = useStore((s) => s.outletWorkspace);
  const shifts = useStore((s) => s.shifts);
  const shiftApplicants = useStore((s) => s.shiftApplicants);

  useEffect(() => {
    syncOutletRequestRoster();
  }, [syncOutletRequestRoster, shifts, shiftApplicants]);

  const earlyReleasedAvailable = useMemo(
    () => listEarlyReleasedPrsForReassign(shifts, agencyPRs),
    [shifts, agencyPRs],
  );

  const activeCount = useMemo(
    () =>
      dateFiltered.filter((s) => s.status === 'on-duty' && !!s.checkedInAt)
        .length,
    [dateFiltered],
  );
  const unavailableCount = useMemo(
    () => dateFiltered.filter((s) => s.status === 'unavailable').length,
    [dateFiltered],
  );
  /** Scheduled / pending — excludes on-duty (active) and unavailable so KPIs partition tonight. */
  const plannedCount = useMemo(
    () =>
      dateFiltered.filter(
        (s) =>
          s.status !== 'unavailable' &&
          !(s.status === 'on-duty' && !!s.checkedInAt),
      ).length,
    [dateFiltered],
  );
  /** Same formula + same rows as the Shifts table Est. payout column. */
  const estPayoutLive = useMemo(() => {
    const prById = new Map(agencyPRs.map((p) => [p.id, p]));
    const earningsContext: RosterShiftEarningsContext | null =
      outletWorkspace.tierRates
        ? {
            rosterScope: dateFiltered,
            agencyPRs,
            outletShifts: shifts,
            drinkMenu,
            receiptScans: prReceiptScans,
            happyHourStart: outletWorkspace.happyHourStart,
            happyHourEnd: outletWorkspace.happyHourEnd,
            workspaceTierRates: outletWorkspace.tierRates,
            commissionOnlyRates: outletWorkspace.commissionOnlyRates,
          }
        : null;
    return filtered.reduce(
      (sum, slot) =>
        sum +
        rosterSlotDisplayPayout(
          slot,
          prById.get(slot.prId),
          outletCommissionRules,
          perDrinkRm,
          shifts,
          drinkMenu,
          prReceiptScans,
          earningsContext,
        ),
      0,
    );
  }, [
    filtered,
    agencyPRs,
    dateFiltered,
    outletCommissionRules,
    perDrinkRm,
    shifts,
    drinkMenu,
    prReceiptScans,
    outletWorkspace.tierRates,
    outletWorkspace.happyHourStart,
    outletWorkspace.happyHourEnd,
  ]);
  const weekScheduled = useMemo(
    () =>
      agencyRoster.filter(
        (s) => weekDays.includes(s.dateIso) && s.status !== 'unavailable',
      ),
    [agencyRoster, weekDays],
  );
  const estLabour = useMemo(
    () =>
      weekScheduled.reduce((s, slot) => s + (slot.estPayout ?? 350), 0) * 1.08,
    [weekScheduled],
  );

  const activePrs = useMemo(
    () => agencyPRs.filter((p) => !p.suspended && !p.detached),
    [agencyPRs],
  );
  const filteredTimetablePrs = useMemo(
    () =>
      filterTimetablePrs(
        activePrs,
        agencyRoster,
        weekDays,
        timetableFilters,
        (prId, dateIso) => getPrScheduleState(prId, agencyRoster, dateIso),
      ),
    [activePrs, agencyRoster, weekDays, timetableFilters],
  );
  const timetableShiftCount = useMemo(
    () =>
      countTimetableMatchingSlots(
        agencyRoster,
        weekDays,
        new Set(filteredTimetablePrs.map((p) => p.id)),
        timetableFilters,
      ),
    [agencyRoster, weekDays, filteredTimetablePrs, timetableFilters],
  );
  const weekShiftTotal = useMemo(
    () => agencyRoster.filter((s) => weekDays.includes(s.dateIso)).length,
    [agencyRoster, weekDays],
  );

  const openEdit = useCallback((id: string) => setEditId(id), []);

  return (
    <div className="iz-screen iz-roster-page">
      <header className="iz-roster-head">
        <TitleWithIcon
          icon={Calendar}
          iconClassName="h-4 w-4 shrink-0 text-[var(--iz-gold-l)]"
          className="font-sora text-lg font-extrabold tracking-tight text-[var(--iz-txt)] md:text-xl"
        >
          Roster
        </TitleWithIcon>
        {(outletRequestCount > 0 || swapCount > 0) && (
          <div className="iz-roster-head-badges">
            {outletRequestCount > 0 && (
              <IzPill variant="amber">
                {outletRequestCount} outlet request
                {outletRequestCount !== 1 ? 's' : ''}
              </IzPill>
            )}
            {swapCount > 0 && (
              <IzPill variant="violet">
                {swapCount} swap{swapCount > 1 ? 's' : ''}
              </IzPill>
            )}
          </div>
        )}
      </header>

      <div className="iz-roster-toolbar">
        <div className="iz-roster-toggle">
          <button
            type="button"
            className={viewMode === 'live' ? 'on live' : ''}
            onClick={() => setViewMode('live')}
          >
            Live
          </button>
          <button
            type="button"
            className={viewMode === 'planning' ? 'on plan' : ''}
            onClick={() => setViewMode('planning')}
          >
            Planning
          </button>
        </div>
        <div className="iz-roster-filters">
          {viewMode === 'live' ? (
            <div
              className="iz-roster-date-live"
              aria-label="Date: Today (live view)"
            >
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
              <span>Today</span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <RosterPlanningDatePicker
                value={planningDate}
                onChange={setPlanningDate}
                rosterDates={dates}
                weekly
                placeholder="Pick week"
                hint="Tap any day — selects that full week (Mon–Sun)."
              />
            </div>
          )}
        </div>
        {canAssign && (
          <Link to="/agency/prs" className="iz-roster-pr-link">
            <Users className="h-3.5 w-3.5" />
            Manage PR
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <div className={`iz-roster-kpis${viewMode === 'live' ? ' cols-4' : ''}`}>
        {viewMode === 'live' ? (
          <>
            <div className="iz-roster-kpi">
              <span className="n">{plannedCount}</span>
              <LabelWithIcon label="Planned PRs" className="l" />
            </div>
            <div className="iz-roster-kpi">
              <span className="n">{activeCount}</span>
              <LabelWithIcon label="Active PRs" className="l" />
            </div>
            <div className="iz-roster-kpi">
              <span className="n">{unavailableCount}</span>
              <LabelWithIcon label="Unavailable PRs" className="l" />
            </div>
            <div className="iz-roster-kpi">
              <span className="n gold">{formatRM(estPayoutLive)}</span>
              <LabelWithIcon label="Est payout" className="l" />
            </div>
          </>
        ) : (
          <>
            <div className="iz-roster-kpi">
              <span className="n">{weekScheduled.length}</span>
              <LabelWithIcon label="Shifts this week" className="l" />
            </div>
            <div className="iz-roster-kpi">
              <span className="n gold">{formatRM(estLabour)}</span>
              <LabelWithIcon label="Est labour cost" className="l" />
            </div>
          </>
        )}
      </div>

      {viewMode === 'live' && earlyReleasedAvailable.length > 0 && (
        <div className="mb-3 mt-3 rounded-xl border border-[rgba(244,183,64,.28)] bg-[rgba(244,183,64,.08)] px-3 py-2.5">
          <p className="text-xs font-semibold text-[var(--iz-amber)]">
            Released early · available to reassign
          </p>
          <p className="iz-tiny iz-muted2 mt-1 leading-snug">
            {earlyReleasedAvailable
              .map(
                (r) =>
                  `${r.prName} (from ${r.fromOutlet}${r.releasedAt ? ` @ ${r.releasedAt}` : ''})`,
              )
              .join(' · ')}
            . Assign them to another outlet on the roster, or leave them sent
            home.
          </p>
        </div>
      )}

      {viewMode === 'live' && (
        <div className="iz-roster-gps">
          <AgencyGpsPanel
            roster={agencyRoster}
            agencyPRs={agencyPRs}
            dateIso={liveDateIso}
            prCheckInMeta={prCheckInMeta}
            prSubRole={prSubRole}
          />
        </div>
      )}

      {viewMode === 'planning' && (
        <div className="iz-roster-planning">
          {canAssign && (
            <button
              type="button"
              className="iz-roster-auto-assign"
              onClick={() => demoAutoAssignPr(planningDate)}
            >
              AI auto-assign next free PR · {planningDate}
            </button>
          )}
          <div className="iz-roster-planning-panel">
            <RosterTimetableFilters
              filters={timetableFilters}
              onChange={(patch) =>
                setTimetableFilters((prev) => ({ ...prev, ...patch }))
              }
              prCount={filteredTimetablePrs.length}
              totalPrs={activePrs.length}
              shiftCount={timetableShiftCount}
              totalShifts={weekShiftTotal}
            />
            <RosterWeeklyTimetable
              weekStartIso={weekStartIso}
              roster={agencyRoster}
              agencyPRs={agencyPRs}
              filters={timetableFilters}
              canAssign={canAssign}
              onEditSlot={openEdit}
              onWeekChange={setPlanningDate}
              todayIso={DEFAULT_ROSTER_DATE_ISO}
            />
          </div>
        </div>
      )}

      {canAssign && pendingPrSwaps.length > 0 && (
        <OutletSection
          title="PR swap requests"
          hint={`${pendingPrSwaps.length} pending`}
          className="!mt-4"
        >
          <div className="grid gap-2 md:grid-cols-2">
            {pendingPrSwaps.map((swap) => (
              <IzCard key={swap.id}>
                <p className="font-sora text-sm font-bold">
                  {swap.requestingPrName}
                </p>
                <p className="iz-tiny iz-muted mt-0.5">
                  {swap.targetOutlet
                    ? `${swap.outlet} → ${swap.targetOutlet}`
                    : swap.outlet}{' '}
                  · {swap.date} · {swap.shift}
                </p>
                {swap.reason && (
                  <p className="iz-tiny iz-muted mt-1 line-clamp-2">
                    &ldquo;{swap.reason}&rdquo;
                  </p>
                )}
                {swap.status === 'pending_replacement' &&
                  swap.replacementPrName && (
                    <p className="iz-tiny mt-2 text-[var(--iz-amber)]">
                      Awaiting {swap.replacementPrName} to accept coverage offer
                    </p>
                  )}
                {swap.replacementDeclineReason && (
                  <p className="iz-tiny mt-1 text-[var(--iz-red)] line-clamp-2">
                    {swap.replacementPrName ?? 'Replacement'} declined: &ldquo;
                    {swap.replacementDeclineReason}&rdquo;
                  </p>
                )}
                {swap.status === 'pending_agency' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="iz-btn iz-btn-soft flex-1 !py-1.5 !text-xs"
                      onClick={() => declinePrSwapRequest(swap.id)}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="iz-btn iz-btn-primary flex-1 !py-1.5 !text-xs"
                      onClick={() => {
                        setApproveSwapId(swap.id);
                        setReplacementPick(replacementCandidates[0]?.id ?? '');
                      }}
                    >
                      Pick replacement
                    </button>
                  </div>
                )}
              </IzCard>
            ))}
          </div>
        </OutletSection>
      )}

      {viewMode === 'live' && (
        <OutletSection
          title="Shifts"
          hint="Editable roster · synced with outlet floor"
          className="!mt-4"
        >
          <RosterShiftFilters
            filters={shiftFilters}
            onChange={(patch) =>
              setShiftFilters((prev) => ({ ...prev, ...patch }))
            }
            resultCount={filtered.length}
            totalCount={dateFiltered.length}
          />
          <RosterShiftTable
            slots={filtered}
            agencyPRs={agencyPRs}
            viewingAgencyId={activeAgencyId}
            prSwapRequests={prSwapRequests}
            outletCommissionRules={outletCommissionRules}
            perDrinkRm={perDrinkRm}
            outletShifts={shifts}
            drinkMenu={drinkMenu}
            receiptScans={prReceiptScans}
            rosterScopeSlots={dateFiltered}
            happyHourStart={outletWorkspace.happyHourStart}
            happyHourEnd={outletWorkspace.happyHourEnd}
            workspaceTierRates={outletWorkspace.tierRates}
            commissionOnlyRates={outletWorkspace.commissionOnlyRates}
            canAssign={canAssign}
            onEdit={openEdit}
            onFlagLate={handleFlagLate}
            onFlagNoShow={handleFlagNoShow}
            onCancelPrSwap={declinePrSwapRequest}
          />
        </OutletSection>
      )}

      {editSlot && (
        <EditRosterModal
          slot={editSlot}
          onClose={() => setEditId(null)}
          onSave={(patch) => {
            handleEditSave(editSlot.id, patch);
            setEditId(null);
          }}
          onRequestOutletSwap={(targetOutlet, note) => {
            requestOutletSwap(editSlot.id, targetOutlet, note);
            setEditId(null);
          }}
          onReassignToOpenShift={(target) => {
            const { shiftStart, shiftEnd } = parseShiftWindow(target.shift);
            assignPrToOutlet({
              prId: editSlot.prId,
              outlet: target.outlet,
              dateIso: target.dateIso,
              dateLabel: target.date,
              shiftStart,
              shiftEnd,
              shift: target.shift,
              outletShiftId: target.id,
              event: target.event,
              payEstimate: target.payEstimate,
            });
            setEditId(null);
          }}
          onCancelShift={() => {
            handleCancelSlot(editSlot.id);
            setEditId(null);
          }}
        />
      )}

      <IzSheet
        open={!!swapToApprove}
        onClose={() => {
          setApproveSwapId(null);
          setReplacementPick('');
        }}
      >
        {swapToApprove && (
          <>
            <IzCardTitle>Assign replacement</IzCardTitle>
            <p className="iz-tiny iz-muted mb-3">
              {swapToApprove.requestingPrName} wants to leave{' '}
              <strong className="text-[var(--iz-txt)]">
                {swapToApprove.outlet}
              </strong>{' '}
              for{' '}
              <strong className="text-[var(--iz-txt)]">
                {swapToApprove.targetOutlet}
              </strong>{' '}
              · {swapToApprove.targetDate} · {swapToApprove.targetShift}. Pick a
              replacement for their current slot.
            </p>
            <label className="iz-tiny iz-muted mb-1 block">
              Replacement PR
            </label>
            <IzSelect
              value={replacementPick}
              onChange={(e) => setReplacementPick(e.target.value)}
              className="mb-4 w-full"
            >
              <option value="">Select PR…</option>
              {replacementCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.rating}★ · {p.trainingLevel}
                </option>
              ))}
            </IzSelect>
            <button
              type="button"
              className="iz-btn iz-btn-primary w-full"
              disabled={!replacementPick}
              onClick={() => {
                approvePrSwapRequest(swapToApprove.id, replacementPick);
                setApproveSwapId(null);
                setReplacementPick('');
              }}
            >
              Send offer to replacement
            </button>
          </>
        )}
      </IzSheet>
    </div>
  );
}

function EditRosterModal({
  slot,
  onClose,
  onSave,
  onRequestOutletSwap,
  onReassignToOpenShift,
  onCancelShift,
}: {
  slot: AgencyRosterSlot;
  onClose: () => void;
  onSave: (patch: Partial<AgencyRosterSlot>) => void;
  onRequestOutletSwap: (targetOutlet: string, note: string) => void;
  onReassignToOpenShift: (target: AgencyOutletAvailableShift) => void;
  onCancelShift: () => void;
}) {
  const shifts = useStore((s) => s.shifts);
  const outletCommissionRules = useStore((s) => s.outletCommissionRules);
  const outletWorkspace = useStore((s) => s.outletWorkspace);
  const displayStatus = rosterPageDisplayStatus(slot.status);
  const initialStatus = EDITABLE_STATUSES.includes(displayStatus)
    ? displayStatus
    : 'scheduled';
  const [status, setStatus] = useState<RosterSlotStatus>(initialStatus);
  const [shiftStart, setShiftStart] = useState(slot.shiftStart);
  const [shiftEnd, setShiftEnd] = useState(slot.shiftEnd);
  const [swapOutlet, setSwapOutlet] = useState('');
  const [swapNote, setSwapNote] = useState('');
  const [reassignShiftId, setReassignShiftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const shiftPreview = `${shiftStart} — ${shiftEnd}`;
  const swapTargets = OUTLET_NAMES.filter((o) => o !== slot.outlet);
  const releasedEarly = Boolean(slot.checkedOutAt);
  const canRequestSwap =
    !releasedEarly &&
    (!slot.outletSwap || slot.outletSwap.status !== 'pending_pr');
  const canCancelShift = !slot.checkedOutAt;

  const availableShifts = useMemo(
    () =>
      listAvailableShiftsForEarlyReleaseReassign({
        shifts,
        excludeOutlet: slot.outlet,
        dateIso: slot.dateIso,
        todayIso: DEFAULT_ROSTER_DATE_ISO,
        commissionRules: outletCommissionRules,
        outletWorkspace,
      }),
    [shifts, slot.outlet, slot.dateIso, outletCommissionRules, outletWorkspace],
  );
  const selectedReassign = availableShifts.find(
    (s) => s.id === reassignShiftId,
  );

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onSave({ status, shiftStart, shiftEnd, shift: shiftPreview });
  };

  const handleSwap = () => {
    if (busy || !swapOutlet) return;
    setBusy(true);
    onRequestOutletSwap(swapOutlet, swapNote.trim());
  };

  const handleReassign = () => {
    if (busy || !selectedReassign) return;
    setBusy(true);
    onReassignToOpenShift(selectedReassign);
  };

  if (releasedEarly) {
    return (
      <IzSheet open onClose={busy ? () => {} : onClose}>
        <div className="iz-sheet-head">
          <div>
            <p className="iz-tiny iz-muted2 uppercase tracking-widest">
              Reassign
            </p>
            <h3>{slot.prName}</h3>
          </div>
          <button
            type="button"
            className="iz-sheet-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="iz-sheet-meta">
          <span className="iz-sheet-meta-pill">
            <MapPin className="h-3 w-3" />
            <strong>{slot.outlet}</strong>
          </span>
          <span className="iz-sheet-meta-pill">
            <Calendar className="h-3 w-3" />
            {slot.date}
          </span>
          <span className="iz-sheet-meta-pill">
            Released early{slot.checkedOutAt ? ` · ${slot.checkedOutAt}` : ''}
          </span>
        </div>

        <p className="iz-tiny iz-muted mt-1">
          Pick an open shift today at another outlet. Hours already worked at{' '}
          {slot.outlet} stay paid.
        </p>

        {availableShifts.length === 0 ? (
          <p className="iz-tiny iz-muted2 mt-4 rounded-lg border border-dashed border-[var(--iz-line)] px-3 py-4 text-center">
            No open shifts at other outlets today.
          </p>
        ) : (
          <div className="mt-4">
            <span className="iz-field-label">Available shift today</span>
            <IzSelect
              block
              className="!text-sm"
              value={reassignShiftId}
              onChange={(e) => setReassignShiftId(e.target.value)}
              disabled={busy}
            >
              <option value="">Select open shift…</option>
              {availableShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.outlet} · {s.shift} · {s.openSlots} open · {s.event}
                </option>
              ))}
            </IzSelect>
            {selectedReassign && (
              <p className="iz-tiny iz-muted2 mt-2">
                {selectedReassign.suppliedSlots}/{selectedReassign.demandSlots}{' '}
                supplied · est. {formatRM(selectedReassign.payEstimate)}
              </p>
            )}
          </div>
        )}

        <div className="iz-sheet-actions">
          <button
            type="button"
            className="iz-btn iz-btn-soft flex-1 !py-3"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-primary flex-1 !py-3"
            disabled={!selectedReassign || busy}
            onClick={handleReassign}
          >
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </IzSheet>
    );
  }

  return (
    <IzSheet open onClose={busy ? () => {} : onClose}>
      <form onSubmit={handleSave}>
        <div className="iz-sheet-head">
          <div>
            <p className="iz-tiny iz-muted2 uppercase tracking-widest">
              Edit shift
            </p>
            <h3>{slot.prName}</h3>
          </div>
          <button
            type="button"
            className="iz-sheet-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="iz-sheet-meta">
          <span className="iz-sheet-meta-pill">
            <MapPin className="h-3 w-3" />
            <strong>{slot.outlet}</strong>
          </span>
          <span className="iz-sheet-meta-pill">
            <Calendar className="h-3 w-3" />
            {slot.date}
          </span>
        </div>

        <div>
          <span className="iz-field-label">Status</span>
          <div
            className="iz-status-chips"
            role="group"
            aria-label="Shift status"
          >
            {EDITABLE_STATUSES.map((s) => {
              const meta = STATUS_LABEL[s];
              return (
                <button
                  key={s}
                  type="button"
                  className={`iz-status-chip${status === s ? ' on' : ''}`}
                  data-variant={meta.variant}
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  disabled={busy}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <span className="iz-field-label">Start</span>
            <IzTimeInput
              value={shiftStart}
              onChange={setShiftStart}
              aria-label="Shift start time"
            />
          </div>
          <div>
            <span className="iz-field-label">End</span>
            <IzTimeInput
              value={shiftEnd}
              onChange={setShiftEnd}
              aria-label="Shift end time"
            />
          </div>
        </div>

        <div className="iz-sheet-preview">
          <div className="k">Shift window</div>
          <div className="v">{shiftPreview}</div>
        </div>

        {canRequestSwap && (
          <div className="mt-4 rounded-xl border border-[rgba(124,107,255,.3)] bg-[rgba(124,107,255,.06)] p-3">
            <div className="flex items-center gap-1.5 iz-tiny font-bold uppercase tracking-wide text-[var(--iz-violet)]">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Request outlet swap
            </div>
            <p className="iz-tiny iz-muted mt-1">
              {slot.prName} must approve before the outlet changes.
            </p>
            <div className="mt-3">
              <span className="iz-field-label">New outlet</span>
              <IzSelect
                block
                className="!text-sm"
                value={swapOutlet}
                onChange={(e) => setSwapOutlet(e.target.value)}
                disabled={busy}
              >
                <option value="">Select outlet…</option>
                {swapTargets.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </IzSelect>
            </div>
            <div className="mt-2">
              <span className="iz-field-label">Note to PR (optional)</span>
              <input
                className="iz-field-input !text-sm"
                value={swapNote}
                onChange={(e) => setSwapNote(e.target.value)}
                placeholder="Reason for relocation…"
                disabled={busy}
              />
            </div>
            <button
              type="button"
              className="iz-btn iz-btn-soft mt-3 w-full !text-xs"
              disabled={!swapOutlet || busy}
              onClick={handleSwap}
            >
              Send swap request to PR
            </button>
          </div>
        )}

        {canCancelShift && (
          <div className="mt-4 rounded-xl border border-[rgba(255,117,117,.25)] bg-[rgba(255,117,117,.06)] p-3">
            <div className="flex items-center gap-1.5 iz-tiny font-bold uppercase tracking-wide text-[var(--destructive)]">
              <Trash2 className="h-3.5 w-3.5" />
              Cancel shift
            </div>
            <p className="iz-tiny iz-muted mt-1">
              Remove this assignment — {slot.prName} will be notified and freed
              for {slot.date}.
            </p>
            <button
              type="button"
              className="iz-btn iz-btn-danger mt-3 w-full !text-xs"
              disabled={busy}
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel shift
            </button>
          </div>
        )}

        <div className="iz-sheet-actions">
          <button
            type="button"
            className="iz-btn iz-btn-soft flex-1 !py-3"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
          <button
            type="submit"
            className="iz-btn iz-btn-primary flex-1 !py-3"
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <IzSheet
        open={cancelConfirmOpen}
        onClose={() => !busy && setCancelConfirmOpen(false)}
      >
        <IzCardTitle>Cancel this shift?</IzCardTitle>
        <p className="iz-tiny iz-muted mb-3">
          {slot.prName} at{' '}
          <strong className="text-[var(--iz-txt)]">{slot.outlet}</strong> ·{' '}
          {slot.date} · {slot.shift}. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="iz-btn iz-btn-soft flex-1"
            disabled={busy}
            onClick={() => setCancelConfirmOpen(false)}
          >
            Keep shift
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-danger flex-1"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onCancelShift();
            }}
          >
            Cancel shift
          </button>
        </div>
      </IzSheet>
    </IzSheet>
  );
}
