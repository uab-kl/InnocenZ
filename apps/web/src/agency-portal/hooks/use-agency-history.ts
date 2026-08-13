import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { shiftHistoryRowFromAssignment } from "@agency-portal/lib/agency-shift-history-map";
import { addDaysToIso } from "@agency-portal/lib/demo-clock";
import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchShifts } from "@/services/shift";
import { fetchShiftAssignments } from "@/services/shift-assignment";
import { useAgencyOutlets } from "./use-agency-outlets";
import { useAgencyPrs } from "./use-agency-prs";
import { useAgencyPvs } from "./use-agency-pvs";

// How far back to pull shifts for the History tabs. The join to assignments
// bounds which nights become rows; a year covers the demo's ledger horizon.
const HISTORY_LOOKBACK_DAYS = 365;

export interface AgencyHistoryData {
	backed: boolean;
	shiftRows: ShiftHistoryRow[];
	pvs: PrPaymentVoucher[];
	agencyPRs: AgencyManagedPR[];
	isLoading: boolean;
}

/**
 * Backend-driven data for the agency History screen. Gated on a real session
 * (`getAgencyIdentity()` non-null): backed sessions get live data, demo sessions
 * get `backed: false` so the screen falls back to its demo store.
 *
 * - **Shift tabs (By PR / By outlet):** rebuilt as `ShiftHistoryRow[]` from
 *   COMPLETED shift-assignments (the roster chain) — one sealed night per
 *   assignment, payout from `payAmount`. The backend has no per-shift drink/tip
 *   sales, so the money breakdown shows wages only (see the map).
 * - **Paid PVs tab:** the already-wired PV backend (`useAgencyPvs`) + PR roster
 *   (`useAgencyPrs`), which the Paid-PV view filters to PAID + scopes by PR.
 *   Receipt scans + itemized PV line detail have no backend and stay empty /
 *   summary-only.
 */
export function useAgencyHistory(): AgencyHistoryData {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyName = identity?.orgName ?? "";
	const toDate = DEFAULT_ROSTER_DATE_ISO;
	// toDate is a module constant, so this only computes once.
	const fromDate = useMemo(
		() => addDaysToIso(toDate, -HISTORY_LOOKBACK_DAYS),
		[],
	);

	// Real outlet + PR directories supply the id -> name maps and the Paid-PV
	// scoping roster; both self-gate / are gated on the real session.
	const { outlets } = useAgencyOutlets();
	const { prs } = useAgencyPrs({ enabled: backed });
	const { pvs } = useAgencyPvs({ enabled: backed });

	const shiftsQuery = useQuery({
		queryKey: ["agency", "history", "shifts", fromDate, toDate],
		queryFn: () => fetchShifts({ fromDate, toDate, pageSize: 500 }, logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});
	// Shares the roster screen's assignment cache.
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		// Paged out: the server clamps to 100, and this key is shared — see
		// lib/fetch-all-pages.ts. History reading a truncated set is its own bug:
		// the oldest 100 rows are exactly the ones history is least about.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShiftAssignments({ page, pageSize: 100 }, logout),
			),
		enabled: backed,
		staleTime: 30_000,
	});

	const shiftRows = useMemo<ShiftHistoryRow[]>(() => {
		if (!backed) return [];
		const shifts = shiftsQuery.data?.data ?? [];
		const assignments = assignmentsQuery.data?.data ?? [];
		const shiftById = new Map(shifts.map((s) => [s.id, s]));
		const prNameById = new Map(prs.map((p) => [p.id, p.name]));
		const outletNameById = new Map(outlets.map((o) => [o.id, o.name]));

		const rows: ShiftHistoryRow[] = [];
		for (const a of assignments) {
			// Only sealed (completed) nights are history — assigned/confirmed are
			// still upcoming; no_show / cancelled aren't worked shifts.
			if (a.status !== "completed") continue;
			const shift = shiftById.get(a.shiftId);
			// Assignment's shift is outside the lookback window — skip.
			if (!shift) continue;
			rows.push(
				shiftHistoryRowFromAssignment({
					assignment: a,
					shiftDate: shift.shiftDate,
					prName: prNameById.get(a.prId) ?? "Unknown PR",
					outletName: outletNameById.get(shift.outletId) ?? shift.outletId,
					agencyName,
				}),
			);
		}
		return rows;
	}, [
		backed,
		agencyName,
		shiftsQuery.data,
		assignmentsQuery.data,
		prs,
		outlets,
	]);

	return {
		backed,
		shiftRows,
		pvs,
		agencyPRs: prs,
		isLoading: backed && (shiftsQuery.isLoading || assignmentsQuery.isLoading),
	};
}
