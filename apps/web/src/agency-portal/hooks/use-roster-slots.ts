import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { rosterSlotsFromBackend } from "@agency-portal/lib/backend-shift-map";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import { fetchShiftAssignments } from "@/services/shift-assignment";

/**
 * Loads the active agency's roster for a week from the backend (shifts +
 * assignments + PRs + outlets) and maps it into the demo's AgencyRosterSlot
 * shape, so the existing roster UI can render live data. One assignment = one
 * slot. Phase 1: read-only. Demo-only fields (swaps, floor metrics, pay tiers)
 * are left unset until their backend features land.
 */
export function useRosterSlots(params: {
	fromDate: string;
	toDate: string;
	/** Gate the backend reads (default true); demo callers pass false. */
	enabled?: boolean;
}) {
	const { fromDate, toDate, enabled = true } = params;
	const { logout } = useAuth();

	// ⚠️ Paged to exhaustion, not `pageSize: 500`. The server clamps every list to
	// 100 and returns the short page with no error, so the roster silently
	// rendered a truncated week — and because these keys are SHARED with the
	// auto-assign planner, whichever hook fetched first decided what the other saw.
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", fromDate, toDate],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShifts({ fromDate, toDate, page, pageSize: 100 }, logout),
			),
		enabled,
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShiftAssignments({ page, pageSize: 100 }, logout),
			),
		enabled,
		staleTime: 30_000,
	});
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () =>
			fetchAllPages((page) => fetchPrPersonnel({ page, pageSize: 100 }, logout)),
		enabled,
		staleTime: 60_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		enabled,
		staleTime: 60_000,
	});

	const slots = useMemo<AgencyRosterSlot[]>(() => {
		const prs = prsQuery.data?.data ?? [];
		const outlets = outletsQuery.data?.data ?? [];
		return rosterSlotsFromBackend({
			// Only the week's shifts; assignments outside this window are dropped.
			shifts: shiftsQuery.data?.data ?? [],
			assignments: assignmentsQuery.data?.data ?? [],
			// The roster identifies PRs by their working nickname, not their
			// legal name; `nickname` is nullable, so full name is the fallback.
			prNameById: new Map(prs.map((p) => [p.id, p.nickname?.trim() || p.name])),
			outletNameById: new Map(outlets.map((o) => [o.id, o.name])),
			// The outlet's real map pin and fence, straight off the outlet rows
			// this hook already loads. The live GPS panel draws the venue and the
			// fence circle from these — no hardcoded coordinate table.
			outletGeoById: new Map(
				outlets.map((o) => [
					o.id,
					{ lat: o.lat, lng: o.lng, geoFenceRadius: o.geoFenceRadius },
				]),
			),
		});
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
