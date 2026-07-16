import { useEffect, useMemo, useState } from 'react';
import type {
  AgencyManagedPR,
  AgencyRosterSlot,
  RosterSlotStatus,
} from '@agency-portal/lib/agency-demo';
import {
  managedPrAgencyLabel,
  rosterPageDisplayStatus,
} from '@agency-portal/lib/agency-demo';
import {
  PrComcardIdentity,
  toComcardPreview,
} from '@agency-portal/components/agency/PrComcardIdentity';
import { DEFAULT_PR_AGENCY_NAME } from '@agency-portal/lib/pr-demo';
import {
  dayColumnLabel,
  primarySlotForPrOnDate,
  weekDayIsos,
  weekRangeLabel,
} from '@agency-portal/lib/roster-week-plan';
import { getPrScheduleState } from '@agency-portal/lib/roster-availability';
import { isPrMarkedDayOff } from '@agency-portal/lib/pr-availability-sync';
import {
  filterTimetablePrs,
  filterPlanningOutletShifts,
  planningOutletShiftFiltersActive,
  rosterShiftFiltersActive,
  timetableSlotMatches,
  type RosterTimetableFilterState,
} from '@agency-portal/lib/roster-shift-filters';
import {
  buildPlanningWeekOutletShiftMap,
  type AgencyOutletAvailableShift,
} from '@agency-portal/lib/agency-outlet-shifts';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import { PR_AGENCY_TIED_OFFERS } from '@agency-portal/lib/pr-features';
import { parseShiftWindow } from '@agency-portal/lib/portal-sync';
import { useStore } from '@agency-portal/lib/store';
import { IzPill, IzSelect, formatRM } from '@agency-portal/components/iz/ui';
import { cn } from '@agency-portal/lib/utils';
import { RotateCcw } from 'lucide-react';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { fmtDFriendly } from '@agency-portal/lib/pr-demo';
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';

const STATUS_CELL: Record<
  RosterSlotStatus,
  { className: string; label: string }
> = {
  scheduled: {
    className: 'iz-roster-week-cell--scheduled',
    label: 'Scheduled',
  },
  'assignment-pending': {
    className: 'iz-roster-week-cell--scheduled',
    label: 'Scheduled',
  },
  'outlet-request-pending': {
    className: 'iz-roster-week-cell--pending',
    label: 'Outlet request',
  },
  'outlet-pending': {
    className: 'iz-roster-week-cell--pending',
    label: 'Awaiting outlet',
  },
  'on-duty': { className: 'iz-roster-week-cell--live', label: 'On duty' },
  'en-route': {
    className: 'iz-roster-week-cell--scheduled',
    label: 'Scheduled',
  },
  'swap-pending': { className: 'iz-roster-week-cell--swap', label: 'Swap' },
  unavailable: { className: 'iz-roster-week-cell--off', label: 'Unavailable' },
};

type AssignTarget = { pr: AgencyManagedPR; dateIso: string };

type RosterWeeklyTimetableProps = {
  weekStartIso: string;
  roster: AgencyRosterSlot[];
  agencyPRs: AgencyManagedPR[];
  filters: RosterTimetableFilterState;
  canAssign: boolean;
  onEditSlot: (slotId: string) => void;
  onWeekChange: (anchorDateIso: string) => void;
  todayIso?: string;
};

export function RosterWeeklyTimetable({
  weekStartIso,
  roster,
  agencyPRs,
  filters,
  canAssign,
  onEditSlot,
  onWeekChange,
  todayIso,
}: RosterWeeklyTimetableProps) {
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [outletRequestSlot, setOutletRequestSlot] =
    useState<AgencyRosterSlot | null>(null);
  const approveOutletPrRequest = useStore((s) => s.approveOutletPrRequest);
  const declineOutletPrRequest = useStore((s) => s.declineOutletPrRequest);
  const agencyOwner = useStore((s) => s.agencyOwner);
  const outletShifts = useStore((s) => s.shifts);
  const outletCommissionRules = useStore((s) => s.outletCommissionRules);
  const outletWorkspace = useStore((s) => s.outletWorkspace);

  const days = useMemo(() => weekDayIsos(weekStartIso), [weekStartIso]);
  const slotFiltersOn = rosterShiftFiltersActive(filters);

  const outletShiftsByDay = useMemo(
    () =>
      buildPlanningWeekOutletShiftMap({
        weekDays: days,
        shifts: outletShifts,
        roster,
        tiedOffers: PR_AGENCY_TIED_OFFERS,
        todayIso: DEFAULT_ROSTER_DATE_ISO,
        commissionRules: outletCommissionRules,
        outletWorkspace,
      }),
    [days, outletShifts, roster, outletCommissionRules, outletWorkspace],
  );

  const agencyName = agencyOwner.orgName || DEFAULT_PR_AGENCY_NAME;

  const prRows = useMemo(
    () =>
      filterTimetablePrs(agencyPRs, roster, days, filters, (prId, dateIso) =>
        getPrScheduleState(prId, roster, dateIso),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [agencyPRs, roster, days, filters],
  );

  const weekLabel = weekRangeLabel(weekStartIso);

  return (
    <>
      <div className="iz-roster-week">
        <div className="iz-roster-week-head">
          <button
            type="button"
            className="iz-roster-week-nav"
            aria-label="Previous week"
            onClick={() => onWeekChange(shiftWeekAnchor(weekStartIso, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 text-center">
            <p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
              Week · {weekLabel}
            </p>
            <p className="iz-tiny iz-muted2">
              Tap comcard to identify PRs · tap a free cell to assign
            </p>
          </div>
          <button
            type="button"
            className="iz-roster-week-nav"
            aria-label="Next week"
            onClick={() => onWeekChange(shiftWeekAnchor(weekStartIso, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="iz-roster-week-scroll">
          <table className="iz-roster-week-table">
            <colgroup>
              <col className="iz-roster-week-col-pr" />
              {days.map((dateIso) => (
                <col key={dateIso} className="iz-roster-week-col-day" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="iz-roster-week-pr-col">PR</th>
                {days.map((dateIso) => {
                  const { dow, dom } = dayColumnLabel(dateIso);
                  const isToday = todayIso === dateIso;
                  return (
                    <th
                      key={dateIso}
                      className={cn('iz-roster-week-day-col', isToday && 'on')}
                    >
                      <span className="dow">{dow}</span>
                      <span className="dom">{dom}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {prRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="iz-roster-week-empty">
                    No PRs match these filters · clear or widen your search
                  </td>
                </tr>
              ) : (
                prRows.map((pr) => {
                  const tiedAgency = managedPrAgencyLabel(pr.id, roster, {
                    agencyName,
                  });
                  return (
                    <tr key={pr.id}>
                      <th scope="row" className="iz-roster-week-pr">
                        <div className="iz-roster-week-pr-inner">
                          <PrComcardIdentity
                            pr={toComcardPreview(pr)}
                            profile={pr}
                            agencyName={tiedAgency}
                            size="week"
                          />
                          <div className="min-w-0">
                            <span className="name">{pr.name}</span>
                            <span className="meta">
                              <span className="rating">{pr.rating}★</span>
                            </span>
                          </div>
                        </div>
                      </th>
                      {days.map((dateIso) => {
                        const state = getPrScheduleState(
                          pr.id,
                          roster,
                          dateIso,
                        );
                        const slot = primarySlotForPrOnDate(
                          roster,
                          pr.id,
                          dateIso,
                        );
                        const dayShifts = outletShiftsByDay[dateIso] ?? [];
                        const openShifts = dayShifts.filter(
                          (s) => s.openSlots > 0,
                        );
                        const canPickCell = canAssign && state === 'free';
                        const hasOpenShifts = openShifts.length > 0;
                        const slotHidden =
                          slot &&
                          slotFiltersOn &&
                          !timetableSlotMatches(slot, filters);
                        const prDayOff =
                          slot?.status === 'unavailable' &&
                          isPrMarkedDayOff(slot);

                        if (state === 'unavailable' && slot) {
                          const tone = STATUS_CELL.unavailable;
                          return (
                            <td key={dateIso} className="iz-roster-week-td">
                              <button
                                type="button"
                                className={`iz-roster-week-cell iz-roster-week-cell--filled ${tone.className}${slotHidden ? ' iz-roster-week-cell--filtered' : ''}`}
                                onClick={() => canAssign && onEditSlot(slot.id)}
                                disabled={!canAssign}
                                aria-label={`${pr.name} unavailable on ${dateIso}`}
                              >
                                <span className="outlet">
                                  {prDayOff ? 'PR off' : slot.outlet}
                                </span>
                                <span className="shift">
                                  {prDayOff
                                    ? 'Synced from PR'
                                    : `${slot.shiftStart}–${slot.shiftEnd}`}
                                </span>
                                <span className="status">{tone.label}</span>
                              </button>
                            </td>
                          );
                        }

                        if (!slot || slotHidden) {
                          return (
                            <td key={dateIso} className="iz-roster-week-td">
                              <button
                                type="button"
                                className={`iz-roster-week-cell iz-roster-week-cell--empty${slotHidden ? ' iz-roster-week-cell--filtered' : ''}${canPickCell && !hasOpenShifts ? ' iz-roster-week-cell--no-shifts' : ''}`}
                                disabled={!canPickCell}
                                onClick={() =>
                                  canPickCell &&
                                  setAssignTarget({ pr, dateIso })
                                }
                                aria-label={`Assign ${pr.name} on ${dateIso}`}
                                title={
                                  canPickCell && !hasOpenShifts
                                    ? 'No open outlet shifts this day — tap to check'
                                    : undefined
                                }
                              >
                                {canPickCell ? (
                                  <Plus className="h-4 w-4" />
                                ) : (
                                  <span className="dash">—</span>
                                )}
                              </button>
                            </td>
                          );
                        }

                        const tone =
                          STATUS_CELL[rosterPageDisplayStatus(slot.status)] ??
                          STATUS_CELL.scheduled;
                        const isOutletRequest =
                          slot.status === 'outlet-request-pending';
                        return (
                          <td key={dateIso} className="iz-roster-week-td">
                            <button
                              type="button"
                              className={`iz-roster-week-cell iz-roster-week-cell--filled ${tone.className}`}
                              onClick={() => {
                                if (isOutletRequest && canAssign) {
                                  setOutletRequestSlot(slot);
                                  return;
                                }
                                if (canAssign) onEditSlot(slot.id);
                              }}
                              disabled={!canAssign}
                              aria-label={`${canAssign ? 'Review' : 'View'} ${pr.name} at ${slot.outlet}`}
                            >
                              <span className="outlet">{slot.outlet}</span>
                              <span className="shift">
                                {slot.shiftStart}–{slot.shiftEnd}
                              </span>
                              <span className="status">{tone.label}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {outletRequestSlot && (
        <OutletRequestReviewSheet
          slot={outletRequestSlot}
          onClose={() => setOutletRequestSlot(null)}
          onApprove={() => {
            approveOutletPrRequest(outletRequestSlot.id);
            setOutletRequestSlot(null);
          }}
          onDecline={() => {
            declineOutletPrRequest(outletRequestSlot.id);
            setOutletRequestSlot(null);
          }}
        />
      )}

      {assignTarget && (
        <AssignWeekCellSheet
          pr={assignTarget.pr}
          dateIso={assignTarget.dateIso}
          allShifts={outletShiftsByDay[assignTarget.dateIso] ?? []}
          filters={filters}
          onClose={() => setAssignTarget(null)}
          onDone={() => setAssignTarget(null)}
        />
      )}
    </>
  );
}

function shiftWeekAnchor(weekStartIso: string, delta: number): string {
  const [y, m, d] = weekStartIso.split('-').map(Number);
  const next = new Date(y, m - 1, d + delta * 7);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function OutletRequestReviewSheet({
  slot,
  onClose,
  onApprove,
  onDecline,
}: {
  slot: AgencyRosterSlot;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const note =
    slot.agencyAssignment?.agencyNote ?? 'Outlet requested this PR for a shift';
  return (
    <IzSheet open onClose={onClose}>
      <h3 className="font-sora text-lg font-bold">Outlet PR request</h3>
      <p className="iz-tiny iz-muted mt-1">
        <strong className="text-[var(--iz-txt)]">{slot.prName}</strong> ·{' '}
        {slot.outlet} · {slot.date}
      </p>
      <p className="iz-tiny iz-muted2 mt-1">
        {slot.shiftStart}–{slot.shiftEnd}
      </p>
      <IzPill variant="amber" className="mt-2">
        Outlet request
      </IzPill>
      <p className="iz-tiny iz-muted mt-3 rounded-xl border border-dashed border-[var(--iz-line)] px-3 py-2.5">
        {note}
      </p>
      <p className="iz-tiny iz-muted2 mt-2">
        Approve to notify the PR — they must confirm before the shift locks.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="iz-btn iz-btn-soft flex-1 !border-[var(--iz-red)] !text-[var(--iz-red)]"
          onClick={onDecline}
        >
          <X className="mr-1 inline h-4 w-4" />
          Decline
        </button>
        <button
          type="button"
          className="iz-btn iz-btn-primary flex-1"
          onClick={onApprove}
        >
          <Check className="mr-1 inline h-4 w-4" />
          Approve
        </button>
      </div>
    </IzSheet>
  );
}

function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return fmtDFriendly(y, m, d);
}

function AssignWeekCellSheet({
  pr,
  dateIso,
  allShifts,
  filters,
  onClose,
  onDone,
}: {
  pr: AgencyManagedPR;
  dateIso: string;
  allShifts: AgencyOutletAvailableShift[];
  filters: RosterTimetableFilterState;
  onClose: () => void;
  onDone: () => void;
}) {
  const assignPrToOutlet = useStore((s) => s.assignPrToOutlet);
  const [outletFilter, setOutletFilter] = useState(filters.outlet);
  const pageShiftFiltersOn = planningOutletShiftFiltersActive(filters);

  useEffect(() => {
    setOutletFilter(filters.outlet);
  }, [dateIso, filters.outlet]);

  const outletOptions = useMemo(
    () =>
      [...new Set(allShifts.map((s) => s.outlet))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [allShifts],
  );

  const visibleShifts = useMemo(() => {
    let open = allShifts.filter((s) => s.openSlots > 0);
    if (pageShiftFiltersOn) {
      open = filterPlanningOutletShifts(open, filters);
    }
    if (outletFilter) {
      open = open.filter((s) => s.outlet === outletFilter);
    }
    return open;
  }, [allShifts, filters, pageShiftFiltersOn, outletFilter]);

  const modalFilterOn = Boolean(outletFilter);
  const [pickId, setPickId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPickId(visibleShifts[0]?.id ?? '');
  }, [visibleShifts]);

  const picked = visibleShifts.find((s) => s.id === pickId);

  const confirm = () => {
    if (busy || !picked) return;
    setBusy(true);
    const { shiftStart, shiftEnd } = parseShiftWindow(picked.shift);
    assignPrToOutlet({
      prId: pr.id,
      outlet: picked.outlet,
      dateIso,
      dateLabel: formatDateLabel(dateIso),
      shiftStart,
      shiftEnd,
      shift: picked.shift,
      outletShiftId: picked.id,
      event: picked.event,
      payEstimate: picked.payEstimate,
    });
    setBusy(false);
    onDone();
  };

  return (
    <IzSheet open onClose={busy ? () => {} : onClose}>
      <h3 className="font-sora text-lg font-bold">Assign outlet shift</h3>
      <p className="iz-tiny iz-muted mt-1">
        <strong className="text-[var(--iz-txt)]">{pr.name}</strong>
        {' · Agency-tied'} · {formatDateLabel(dateIso)}
      </p>
      <p className="iz-tiny iz-muted2 mt-1">
        Pick a posted outlet shift — PR is scheduled immediately and can cancel
        per agency policy.
      </p>

      <div className="iz-roster-assign-filters mt-3">
        <label className="iz-roster-assign-filter-field">
          <span className="iz-field-label">Filter outlet</span>
          <IzSelect
            block
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            disabled={busy}
          >
            <option value="">All outlets</option>
            {outletOptions.map((outlet) => (
              <option key={outlet} value={outlet}>
                {outlet}
              </option>
            ))}
          </IzSelect>
        </label>
        {(modalFilterOn || pageShiftFiltersOn) && (
          <button
            type="button"
            className="iz-roster-assign-filter-clear"
            disabled={busy}
            onClick={() => setOutletFilter('')}
          >
            <RotateCcw className="h-3 w-3" />
            Clear outlet
          </button>
        )}
      </div>
      {pageShiftFiltersOn && (
        <p className="iz-tiny iz-muted2 mt-1.5">
          Timetable time / payout filters also apply — clear those above the
          grid to widen results.
        </p>
      )}

      {visibleShifts.length === 0 ? (
        <p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
          {modalFilterOn || pageShiftFiltersOn
            ? 'No open shifts match your filters on this date.'
            : 'No open outlet shifts on this date.'}
        </p>
      ) : (
        <>
          <p className="iz-field-label mt-3">
            Available shifts · {visibleShifts.length}
          </p>
          <div className="iz-roster-shift-pick-scroll mt-1.5">
            <div className="iz-roster-shift-pick-list">
              {visibleShifts.map((shift) => {
                const selected = shift.id === pickId;
                return (
                  <button
                    key={shift.id}
                    type="button"
                    className={cn('iz-roster-shift-pick', selected && 'on')}
                    onClick={() => setPickId(shift.id)}
                    disabled={busy}
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-sora text-sm font-bold text-[var(--iz-txt)]">
                          {shift.outlet}
                        </span>
                        <span className="iz-tiny iz-muted">
                          {shift.shift.replace(/\s+/g, ' ')}
                        </span>
                      </div>
                      <p className="iz-tiny iz-muted2 mt-0.5 line-clamp-2">
                        {shift.event}
                      </p>
                      <p className="iz-tiny mt-1 text-[var(--iz-gold-l)]">
                        {shift.openSlots} open · est{' '}
                        {formatRM(shift.payEstimate)}
                      </p>
                    </div>
                    <span className="iz-tiny iz-muted2 shrink-0 text-right leading-tight">
                      Posted shift
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="iz-btn iz-btn-primary mt-4 w-full"
            disabled={busy || !picked}
            onClick={confirm}
          >
            {busy ? 'Assigning…' : 'Schedule PR'}
          </button>
        </>
      )}
    </IzSheet>
  );
}
