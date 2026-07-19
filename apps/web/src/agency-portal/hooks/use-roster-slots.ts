import type {
	AgencyRosterSlot,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import { parseShiftWindow } from "@agency-portal/lib/portal-sync";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import {
	fetchShiftAssignments,
	type ShiftAssignmentStatus,
} from "@/services/shift-assignment";

// A shift-assignment status doesn't fully overlap the demo's live roster
// statuses; map to the closest planning-view state.
function rosterStatusFromAssignment(
	status: ShiftAssignmentStatus,
): RosterSlotStatus {
	switch (status) {
		case "assigned":
			return "assignment-pending"; // agency assigned, awaiting PR
		case "confirmed":
		case "completed":
			return "scheduled";
		case "no_show":
		case "cancelled":
			return "unavailable";
		default:
			return "scheduled";
	}
}

// The backend shift `slot` is free text; only treat it as a time window when it
// actually looks like one ("HH:MM"), so label-only slots don't get fake times.
const TIME_WINDOW_RE = /\d{1,2}:\d{2}/;

function shiftWindow(slot: string | null): { start: string; end: string } {
	if (slot && TIME_WINDOW_RE.test(slot)) {
		const { shiftStart, shiftEnd } = parseShiftWindow(slot);
		return { start: shiftStart, end: shiftEnd };
	}
	return { start: "", end: "" };
}

function minutesOf(hhmm: string): number | null {
	const [h, m] = hhmm.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	return h * 60 + m;
}

// Estimated payout so the payout filter has something to compare: window hours
// (wrapping past midnight) times the shift's hourly rate. Undefined when the
// window or rate can't be parsed.
function estPayoutFor(
	window: { start: string; end: string },
	payPerHour: string,
): number | undefined {
	const start = minutesOf(window.start);
	const end = minutesOf(window.end);
	const pay = Number(payPerHour);
	if (start == null || end == null || !Number.isFinite(pay)) return undefined;
	let mins = end - start;
	if (mins <= 0) mins += 24 * 60;
	return (mins / 60) * pay;
}

/**
 * Loads the active agency's roster for a week from the backend (shifts +
 * assignments + PRs + outlets) and maps it into the demo's AgencyRosterSlot
 * shape, so the existing roster UI can render live data. One assignment = one
 * slot. Phase 1: read-only. Demo-only fields (swaps, floor metrics, pay tiers)
 * are left unset until their backend features land.
 */
export function useRosterSlots(params: { fromDate: string; toDate: string }) {
	const { fromDate, toDate } = params;
	const { logout } = useAuth();

	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", fromDate, toDate],
		queryFn: () => fetchShifts({ fromDate, toDate, pageSize: 200 }, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		queryFn: () => fetchShiftAssignments({ pageSize: 500 }, logout),
		staleTime: 30_000,
	});
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});

	const slots = useMemo<AgencyRosterSlot[]>(() => {
		const shifts = shiftsQuery.data?.data ?? [];
		const assignments = assignmentsQuery.data?.data ?? [];
		const prs = prsQuery.data?.data ?? [];
		const outlets = outletsQuery.data?.data ?? [];

		// Only the week's shifts; assignments outside this window are dropped.
		const shiftById = new Map(shifts.map((s) => [s.id, s]));
		const prNameById = new Map(prs.map((p) => [p.id, p.name]));
		const outletNameById = new Map(outlets.map((o) => [o.id, o.name]));

		const result: AgencyRosterSlot[] = [];
		for (const a of assignments) {
			const shift = shiftById.get(a.shiftId);
			if (!shift) continue;
			const window = shiftWindow(shift.slot);
			result.push({
				id: a.id,
				prId: a.prId,
				prName: prNameById.get(a.prId) ?? "Unknown PR",
				outlet: outletNameById.get(shift.outletId) ?? shift.outletId,
				date: shift.shiftDate,
				dateIso: shift.shiftDate,
				shift: shift.slot ?? shift.eventName ?? "",
				shiftStart: window.start,
				shiftEnd: window.end,
				estPayout: estPayoutFor(window, shift.payPerHour),
				status: rosterStatusFromAssignment(a.status),
				checkedInAt: a.checkInAt ?? undefined,
				checkedOutAt: a.checkOutAt ?? undefined,
				noShowFlag: a.status === "no_show" ? true : undefined,
				cancelledAt: a.status === "cancelled" ? a.updatedAt : undefined,
				agencyId: a.agencyId,
			});
		}
		return result;
	}, [
		shiftsQuery.data,
		assignmentsQuery.data,
		prsQuery.data,
		outletsQuery.data,
	]);

	return {
		slots,
		isLoading:
			shiftsQuery.isLoading ||
			assignmentsQuery.isLoading ||
			prsQuery.isLoading ||
			outletsQuery.isLoading,
		isFetching:
			shiftsQuery.isFetching ||
			assignmentsQuery.isFetching ||
			prsQuery.isFetching ||
			outletsQuery.isFetching,
		isError:
			shiftsQuery.isError ||
			assignmentsQuery.isError ||
			prsQuery.isError ||
			outletsQuery.isError,
	};
}
