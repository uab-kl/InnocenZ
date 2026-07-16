import {
  managedPrAgencyLabel,
  rosterSlotAgencyName,
  type AgencyManagedPR,
  type AgencyRosterSlot,
} from '@agency-portal/lib/agency-demo';
import {
  outletShiftDemandSupplied,
  outletShiftEffectiveDemand,
  type ShiftApplicant,
} from '@agency-portal/lib/outlet-demo';
import { DEFAULT_PR_AGENCY_NAME } from '@agency-portal/lib/pr-demo';
import {
  outletMatches,
  parseShiftWindow,
} from '@agency-portal/lib/portal-sync';
import type { ShiftRequest } from '@agency-portal/lib/store';

export type ShiftDemandRow = {
  source: string;
  slots: number;
};

export type ShiftStaffRow = {
  id: string;
  name: string;
  tier?: string;
  rating?: number;
  statusLabel:
    'Booked' | 'Applied' | 'Accepted' | 'Declined' | 'Pending agency';
  agencyLabel: string;
  shiftTime: string;
};

export function formatCalendarTimeShort(time: string): string {
  const [hRaw, mRaw] = time.split(':').map(Number);
  const h = hRaw ?? 0;
  const m = mRaw ?? 0;
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? 'am' : 'pm';
  if (m === 0) return `${hour12}${ampm}`;
  return `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
}

export function formatShiftTimeRange(shift: string): string {
  const { shiftStart, shiftEnd } = parseShiftWindow(shift);
  return `${formatCalendarTimeShort(shiftStart)} – ${formatCalendarTimeShort(shiftEnd)}`;
}

export function agencyNameForShift(
  shift: ShiftRequest,
  roster: AgencyRosterSlot[],
  dateIso: string,
  fallback = DEFAULT_PR_AGENCY_NAME,
): string {
  const slots = roster.filter(
    (s) =>
      outletMatches(s.outlet, shift.outletName) &&
      s.dateIso === dateIso &&
      s.shift === shift.shift,
  );
  const slot = slots.find((s) => s.agencyAssignment?.agencyName || s.agencyId);
  return slot ? rosterSlotAgencyName(slot, fallback) : fallback;
}

export function prAgencyLabel(
  prId: string,
  roster: AgencyRosterSlot[],
  linkedAgency = DEFAULT_PR_AGENCY_NAME,
): string {
  return managedPrAgencyLabel(prId, roster, { agencyName: linkedAgency });
}

/** Posted demand — sourced from the outlet's linked agency. */
export function shiftDemandBreakdown(
  shift: ShiftRequest,
  agencyName: string,
): ShiftDemandRow[] {
  const demand = outletShiftEffectiveDemand(shift);
  return [{ source: agencyName, slots: demand }];
}

export function buildShiftStaffRows(input: {
  shift: ShiftRequest;
  dateIso: string;
  agencyPRs: AgencyManagedPR[];
  agencyRoster: AgencyRosterSlot[];
  shiftApplicants: ShiftApplicant[];
  agencyName: string;
}): {
  booked: ShiftStaffRow[];
  applicants: ShiftStaffRow[];
  pendingCount: number;
} {
  const { shift, agencyPRs, agencyRoster, shiftApplicants, agencyName } = input;
  const prById = Object.fromEntries(agencyPRs.map((pr) => [pr.id, pr]));
  const shiftTime = formatShiftTimeRange(shift.shift);
  const agencyFor = (prId: string) =>
    prAgencyLabel(prId, agencyRoster, agencyName);

  const booked: ShiftStaffRow[] = (shift.prs ?? []).map((prId) => {
    const pr = prById[prId];
    return {
      id: prId,
      name: pr?.name ?? prId,
      tier: pr?.trainingLevel,
      rating: pr?.rating,
      statusLabel: 'Booked',
      agencyLabel: agencyFor(prId),
      shiftTime,
    };
  });

  const bookedIds = new Set(shift.prs ?? []);
  const applicants: ShiftStaffRow[] = shiftApplicants
    .filter((a) => a.shiftId === shift.id && !bookedIds.has(a.prId))
    .map((a) => {
      const statusLabel =
        a.status === 'accepted'
          ? 'Accepted'
          : a.status === 'declined'
            ? 'Declined'
            : a.source === 'outlet_request'
              ? 'Pending agency'
              : 'Applied';
      return {
        id: a.prId,
        name: a.prName,
        rating: a.rating,
        statusLabel,
        agencyLabel: agencyFor(a.prId),
        shiftTime,
      };
    });

  const pendingCount = shiftApplicants.filter(
    (a) => a.shiftId === shift.id && a.status === 'pending',
  ).length;

  return { booked, applicants, pendingCount };
}

export function shiftStaffingSummary(
  shift: ShiftRequest,
  shiftApplicants: ShiftApplicant[],
): { demand: number; supplied: number; pendingCount: number } {
  const { demand, supplied } = outletShiftDemandSupplied(shift);
  const pendingCount = shiftApplicants.filter(
    (a) => a.shiftId === shift.id && a.status === 'pending',
  ).length;
  return { demand, supplied, pendingCount };
}
