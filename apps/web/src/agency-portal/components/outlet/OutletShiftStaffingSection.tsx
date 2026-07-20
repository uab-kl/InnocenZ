import {
  IzPill,
  TierBadge,
  TrafficPill,
} from '@agency-portal/components/iz/ui';
import {
  agencyNameForShift,
  buildShiftStaffRows,
  shiftDemandBreakdown,
  shiftStaffingSummary,
  type ShiftStaffRow,
} from '@agency-portal/lib/outlet-shift-staffing';
import { resolveOutletShiftDateIso } from '@agency-portal/lib/agency-outlet-shifts';
import type {
  AgencyManagedPR,
  AgencyRosterSlot,
} from '@agency-portal/lib/agency-demo';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import { useStore, type ShiftRequest } from '@agency-portal/lib/store';
import { cn } from '@agency-portal/lib/utils';
import { trafficLevelForRatio } from '@agency-portal/lib/traffic-status';
import { ClipboardList, UserCheck, Users } from 'lucide-react';

function StaffRow({ row }: { row: ShiftStaffRow }) {
  return (
    <div className="iz-outlet-staff-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-[var(--iz-txt)]">
            {row.name}
          </span>
          {row.tier && <TierBadge tier={row.tier} />}
          {row.rating != null && (
            <span className="text-[10px] text-[var(--iz-gold)]">
              {row.rating}★
            </span>
          )}
        </div>
        <p className="iz-tiny iz-muted2 mt-0.5">
          {row.shiftTime} · {row.agencyLabel}
        </p>
      </div>
      <span
        className={cn(
          'iz-outlet-staff-tag shrink-0',
          row.statusLabel === 'Booked' && 'iz-outlet-staff-tag--booked',
          row.statusLabel === 'Applied' && 'iz-outlet-staff-tag--applied',
          row.statusLabel === 'Accepted' && 'iz-outlet-staff-tag--accepted',
          row.statusLabel === 'Pending agency' &&
            'iz-outlet-staff-tag--pending',
          row.statusLabel === 'Declined' && 'iz-outlet-staff-tag--declined',
        )}
      >
        {row.statusLabel}
      </span>
    </div>
  );
}

export function OutletShiftStaffingSection({
  shift,
  roster: rosterOverride,
  agencyPrs: agencyPrsOverride,
}: {
  shift: ShiftRequest;
  /**
   * Backend roster slots + PR records for a real outlet session; `shift.prs` is
   * resolved against them, so they travel together. Omitted on demo sessions.
   */
  roster?: AgencyRosterSlot[];
  agencyPrs?: AgencyManagedPR[];
}) {
  const storeRoster = useStore((s) => s.agencyRoster);
  const storeAgencyPRs = useStore((s) => s.agencyPRs);
  const shiftApplicants = useStore((s) => s.shiftApplicants);
  const agencyRoster = rosterOverride ?? storeRoster;
  const agencyPRs = agencyPrsOverride ?? storeAgencyPRs;

  const dateIso = resolveOutletShiftDateIso(
    shift.date,
    shift.dateIso,
    DEFAULT_ROSTER_DATE_ISO,
  );
  const agencyName = agencyNameForShift(shift, agencyRoster, dateIso);
  const demandRows = shiftDemandBreakdown(shift, agencyName);
  const { demand, supplied, pendingCount } = shiftStaffingSummary(
    shift,
    shiftApplicants,
  );
  const { booked, applicants } = buildShiftStaffRows({
    shift,
    dateIso,
    agencyPRs,
    agencyRoster,
    shiftApplicants,
    agencyName,
  });

  return (
    <div className="iz-outlet-staffing-section">
      <div className="iz-outlet-staffing-block">
        <div className="flex items-center justify-between gap-2">
          <p className="iz-outlet-staffing-heading flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
            Demand · {demand} PR needed
          </p>
          <TrafficPill
            level={trafficLevelForRatio(supplied, demand)}
            className="!py-0.5 !text-[9px]"
          >
            {supplied}/{demand} supplied
          </TrafficPill>
        </div>
        <div className="mt-2 space-y-1.5">
          {demandRows.map((row) => (
            <div key={row.source} className="iz-outlet-demand-row">
              <span className="iz-outlet-staff-tag shrink-0 iz-outlet-staff-tag--agency">
                Agency
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--iz-txt)]">
                  {row.source}
                </p>
                <p className="iz-tiny iz-muted2">{row.slots} slots posted</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="iz-outlet-staffing-block">
        <p className="iz-outlet-staffing-heading flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
          PRs on shift · {booked.length} booked
          {pendingCount > 0 ? ` · ${pendingCount} applied` : ''}
        </p>
        {booked.length === 0 ? (
          <p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-3 py-4 text-center">
            No PRs booked yet —{' '}
            {pendingCount > 0
              ? `${pendingCount} waiting review`
              : 'open for applications'}
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {booked.map((row) => (
              <StaffRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

      {applicants.length > 0 && (
        <div className="iz-outlet-staffing-block">
          <p className="iz-outlet-staffing-heading flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
            Applicants · {applicants.length}
          </p>
          <p className="iz-tiny iz-muted2 mt-0.5">
            PRs who applied for this event — review before confirming shift.
          </p>
          <div className="mt-2 space-y-1.5">
            {applicants.map((row) => (
              <StaffRow key={`${row.id}-${row.statusLabel}`} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
