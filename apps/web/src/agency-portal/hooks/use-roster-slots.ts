import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { rosterSlotsFromBackend } from "@agency-portal/lib/backend-shift-map";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchOutletSwaps } from "@/services/outlet-swap";
import {
	blockedDatesByPr,
	fetchPrAvailability,
} from "@/services/pr-availability";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import { fetchShiftAssignments } from "@/services/shift-assignment";

/**
 * Loads the active agency's roster for a week from the backend (shifts +
 * assignments + PRs + outlets) and maps it into the demo's AgencyRosterSlot
 * shape, so the existing roster UI can render live data. One assignment = one
 * slot. Phase 1: read-only. Floor metrics and pay tiers are still unset — their backend
 * features have not landed. Swaps HAVE landed, so pending swap requests are
 * folded in below.
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
			fetchAllPages((page) =>
				fetchPrPersonnel({ page, pageSize: 100 }, logout),
			),
		enabled,
		staleTime: 60_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		enabled,
		staleTime: 60_000,
	});
	// Days the roster's PRs have blocked on their own schedule. Keyed on the week
	// like the shifts query — a PR can block any day, so this is the only query
	// here whose answer genuinely differs per window.
	//
	// Not paged: this returns one row per blocked day per PR over seven days, and
	// the endpoint applies no clamp of its own. If that ever changes, page it to
	// exhaustion like the shifts above — a truncated page here would silently
	// re-open blocked days on the grid.
	const availabilityQuery = useQuery({
		queryKey: ["roster", "availability", fromDate, toDate],
		queryFn: () => fetchPrAvailability({ from: fromDate, to: toDate }, logout),
		enabled,
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});

	/**
	 * Assignments with a swap awaiting the PR's answer.
	 *
	 * The roster slot id IS the assignment id (see `rosterSlotsFromBackend`), so
	 * this set maps straight onto slots. Without it the roster's "Swap pending"
	 * filter matched nothing on a real session — the status existed only in demo
	 * fixtures — while the swap itself was live in the backend.
	 */
	const swapsQuery = useQuery({
		queryKey: ["roster", "pending-swaps"],
		queryFn: () => fetchOutletSwaps({ status: "pending_pr" }, logout),
		enabled,
		staleTime: 30_000,
	});
	const pendingSwapAssignmentIds = useMemo(
		() => new Set((swapsQuery.data ?? []).map((r) => r.assignmentId)),
		[swapsQuery.data],
	);

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
		}).map((slot) =>
			// Only over a SCHEDULED slot. A PR already on the floor, or off the plan
			// entirely, is not usefully described as "swap pending" — the swap is a
			// question about a future shift, and overwriting on-duty would hide
			// someone actually working from the live view.
			slot.status === "scheduled" && pendingSwapAssignmentIds.has(slot.id)
				? { ...slot, status: "swap-pending" as const }
				: slot,
		);
	}, [
		pendingSwapAssignmentIds,
		shiftsQuery.data,
		assignmentsQuery.data,
		prsQuery.data,
		outletsQuery.data,
	]);

	/**
	 * `prId -> Set<'YYYY-MM-DD'>` for the week. Deliberately NOT folded into
	 * `slots`: a blocked day usually has no shift and therefore no slot to hang
	 * itself on, which is precisely why the PR's block was invisible to the
	 * agency before — the grid could only draw what an assignment row already
	 * described. It travels as its own map so an empty cell can say something.
	 */
	const blockedDates = useMemo(
		() => blockedDatesByPr(availabilityQuery.data ?? []),
		[availabilityQuery.data],
	);

	return {
		slots,
		blockedDates,
		isLoading:
			shiftsQuery.isLoading ||
			assignmentsQuery.isLoading ||
			prsQuery.isLoading ||
			outletsQuery.isLoading,
		isFetching:
			shiftsQuery.isFetching ||
			assignmentsQuery.isFetching ||
			prsQuery.isFetching ||
			outletsQuery.isFetching ||
			availabilityQuery.isFetching,
		// Availability is deliberately absent: it is ADDITIVE information, and a
		// failed fetch must not blank a roster that is otherwise fine. The server
		// still refuses an assign on a blocked day, so the worst case is a cell
		// that looks free and 409s on click — never a silently-allowed booking.
		isError:
			shiftsQuery.isError ||
			assignmentsQuery.isError ||
			prsQuery.isError ||
			outletsQuery.isError,
	};
}
