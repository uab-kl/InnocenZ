import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	indexShiftSales,
	shiftHistoryRowFromAssignment,
	shiftSaleKey,
} from "@agency-portal/lib/agency-shift-history-map";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import {
	type ShiftHistoryRow,
	sortShiftHistoryDesc,
} from "@agency-portal/lib/shift-history-utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShiftAssignments } from "@/services/shift-assignment";
import { fetchShiftSales } from "@/services/shift-sale";

// The assignment endpoint has no date filter, so the page size is what bounds
// the ledger. One outlet's sealed nights stay well inside this.
const HISTORY_PAGE_SIZE = 500;

export interface OutletHistoryData {
	backed: boolean;
	/** The signed-in outlet's name; empty on a demo session. */
	outletName: string;
	rows: ShiftHistoryRow[];
	/**
	 * PRs rostered at this outlet (with profile photos). Used by history cards
	 * for avatars — same source as outlet Today.
	 */
	prs: AgencyManagedPR[];
	isLoading: boolean;
}

/**
 * Backend-driven data for the outlet History screen. Gated on a real session
 * (`getOutletIdentity()` non-null): backed sessions get live data, demo sessions
 * get `backed: false` so the screen falls back to its demo store.
 *
 * Rows are COMPLETED shift-assignments for the caller's own venues — the same
 * per-assignment shape the agency History uses. The list response joins the PR
 * display name and shift date. PR profile photos come from `/pr` (outlet-scoped
 * to PRs rostered at the caller's venues — same as Today). Agency names ride on
 * the assignment itself for the "by agency" filter. As on the agency side the
 * RECEIVED money joins `shift_sale` on (shift, PR) — drinks, tips and service
 * entitlements from the PR's approved receipts.
 */
export function useOutletHistory(): OutletHistoryData {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletName = identity?.outletName ?? "";

	const assignmentsQuery = useQuery({
		queryKey: ["outlet", "history", "assignments"],
		queryFn: () =>
			fetchShiftAssignments(
				{ status: "completed", pageSize: HISTORY_PAGE_SIZE },
				logout,
			),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

	// NOTE: this used to build an id -> name map from GET /agency. That endpoint is
	// `requireRole('admin','agency')` — an outlet must not enumerate agencies — so
	// the call always failed, the map was always empty, and EVERY row fell back to
	// the literal "Agency". The History filter then collapsed to one useless
	// option. The name now rides on the assignment itself, joined server-side from
	// its agency FK, which needs no directory access at all.

	// Floor sales (the RECEIVED side) — the PR's approved receipts, mirrored onto
	// shift_sale by the backend. Deliberately NOT date-filtered: the assignments
	// query above has no date bound either, so a window here would leave older
	// rows on screen reading RM 0.00 — a wrong number dressed as a real one.
	// `GET /shift-sale` pins an outlet caller to its own venues server-side.
	const salesQuery = useQuery({
		queryKey: ["outlet", "history", "shift-sales"],
		queryFn: () => fetchShiftSales({}, logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

	// Same key/fn as outlet Today so history cards share the PR photo cache.
	const prsQuery = useQuery({
		queryKey: ["outlet", "today", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const rows = useMemo<ShiftHistoryRow[]>(() => {
		if (!backed) return [];
		const assignments = assignmentsQuery.data?.data ?? [];
		const saleByShiftPr = indexShiftSales(salesQuery.data ?? []);

		const built: ShiftHistoryRow[] = [];
		for (const a of assignments) {
			// Defensive: the status filter is applied server-side, but only sealed
			// nights are history.
			if (a.status !== "completed") continue;
			// Without the joined shift date there is no night to file the row under.
			if (!a.shiftDate) continue;
			built.push(
				shiftHistoryRowFromAssignment({
					assignment: a,
					shiftDate: a.shiftDate,
					prName: a.prName ?? "Unknown PR",
					outletName,
					// Falls back only if the agency row itself is gone, which the
					// FK makes near-impossible — not on every row, as before.
					agencyName: a.agencyName ?? "Agency",
					sale: saleByShiftPr.get(shiftSaleKey(a.shiftId, a.prId)),
				}),
			);
		}
		return sortShiftHistoryDesc(built);
	}, [backed, outletName, assignmentsQuery.data, salesQuery.data]);

	const prs = useMemo<AgencyManagedPR[]>(
		() => (backed ? (prsQuery.data?.data ?? []).map(managedPrFromBackend) : []),
		[backed, prsQuery.data],
	);

	return {
		backed,
		outletName,
		rows,
		prs,
		isLoading:
			backed &&
			(assignmentsQuery.isLoading ||
				prsQuery.isLoading ||
				// Without this the cards paint Received RM 0.00 for a beat before
				// the sales land — a wrong number, not a pending one.
				salesQuery.isLoading),
	};
}
