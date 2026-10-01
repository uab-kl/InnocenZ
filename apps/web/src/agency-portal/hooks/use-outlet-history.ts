import {
	fetchAllOutletAssignments,
	fetchAllOutletPrs,
	fetchAllOutletShifts,
	fetchOutletShiftSales,
	outletPrsKey,
	outletShiftSalesKey,
} from "@agency-portal/hooks/use-outlet-shared-queries";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	indexShiftSales,
	shiftHistoryRowFromAssignment,
	shiftSaleKey,
} from "@agency-portal/lib/agency-shift-history-map";
import { historyEventFields } from "@agency-portal/lib/backend-shift-map";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import {
	type ShiftHistoryRow,
	sortShiftHistoryDesc,
} from "@agency-portal/lib/shift-history-utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";

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
		// The endpoint has no date filter, so the ledger is every completed night —
		// paged out in full. It used to ask for 500 in one page and got the
		// server's 100, so History quietly stopped at a venue's hundredth night.
		queryFn: () => fetchAllOutletAssignments({ status: "completed" }, logout),
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
		// Shared with Today and the Calendar sheet's sales tiles.
		queryKey: outletShiftSalesKey,
		queryFn: () => fetchOutletShiftSales(logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

	// Same key/fn as outlet Today so history cards share the PR photo cache.
	const prsQuery = useQuery({
		queryKey: outletPrsKey,
		queryFn: () => fetchAllOutletPrs({}, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	/*
	 * WHAT KIND OF NIGHT IT WAS — "VIP night", an "Other" name — as the Calendar
	 * and Today show it. The assignment list History is built from joins only
	 * the shift's `eventKind`; the sub-type lives on the shift (0167) or the card
	 * it was posted from, which is on the SHIFT read. So the special shifts are
	 * read too — only the special ones (`?eventKind=special`, pinned to the
	 * caller's venues server-side), and only once the ledger holds a special
	 * night, so a venue that never ran one pays nothing for this.
	 */
	const hasSpecialNight = useMemo(
		() =>
			(assignmentsQuery.data?.data ?? []).some(
				(a) => a.status === "completed" && a.eventKind === "special",
			),
		[assignmentsQuery.data],
	);
	const specialShiftsQuery = useQuery({
		queryKey: ["outlet", "history", "special-shifts"],
		queryFn: () => fetchAllOutletShifts({ eventKind: "special" }, logout),
		enabled: backed && hasSpecialNight,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

	const rows = useMemo<ShiftHistoryRow[]>(() => {
		if (!backed) return [];
		const assignments = assignmentsQuery.data?.data ?? [];
		const saleByShiftPr = indexShiftSales(salesQuery.data ?? []);
		const specialShiftById = new Map(
			(specialShiftsQuery.data?.data ?? []).map((s) => [s.id, s]),
		);

		const built: ShiftHistoryRow[] = [];
		for (const a of assignments) {
			// Defensive: the status filter is applied server-side, but only sealed
			// nights are history.
			if (a.status !== "completed") continue;
			// Without the joined shift date there is no night to file the row under.
			if (!a.shiftDate) continue;
			built.push({
				...shiftHistoryRowFromAssignment({
					assignment: a,
					shiftDate: a.shiftDate,
					prName: a.prName ?? "Unknown PR",
					outletName,
					// Falls back only if the agency row itself is gone, which the
					// FK makes near-impossible — not on every row, as before.
					agencyName: a.agencyName ?? "Agency",
					sale: saleByShiftPr.get(shiftSaleKey(a.shiftId, a.prId)),
				}),
				...historyEventFields(a.eventKind, specialShiftById.get(a.shiftId)),
			});
		}
		return sortShiftHistoryDesc(built);
	}, [
		backed,
		outletName,
		assignmentsQuery.data,
		salesQuery.data,
		specialShiftsQuery.data,
	]);

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
