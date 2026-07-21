import {
	createShiftInputFromPost,
	type OutletShiftPostItem,
} from "@agency-portal/lib/backend-shift-map";
import { addDaysToIso, getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { createShift, fetchShifts } from "@/services/shift";
import { fetchShiftAssignments } from "@/services/shift-assignment";

// Booking caps are daily and forward-looking, but the composer can schedule
// well ahead, so cover a generous horizon. Only same-date shifts count, so a
// wide window just guarantees coverage — it never inflates a day's total.
const CAP_LOOKAHEAD_DAYS = 120;

/**
 * An already-booked shift in exactly the shape the Post Job subscription-cap
 * counters (`outletPrHeadcountForDate` / `outletNamedPrCountForDate`) consume.
 * `requestedPrIds` is the backend proxy for the demo's outlet-named PRs: a
 * posted shift drops the demo `requestedPrIds`, so the assigned PRs are the
 * closest persisted signal of who the outlet has committed for that day.
 */
export interface OutletBookedShift {
	outletName: string;
	dateIso: string;
	quantity: number;
	requestedPrIds: string[];
}

export interface UseOutletPostJob {
	/** True on a real signed-in outlet session; false falls back to the demo store. */
	backed: boolean;
	/** Post one or more shifts to the backend. Rejects if any shift fails. */
	postShifts: (items: OutletShiftPostItem[]) => Promise<void>;
	isPosting: boolean;
	/**
	 * The outlet's already-booked shifts over the cap horizon, for daily
	 * plan-limit counting. Empty on a demo session (the caller counts the demo
	 * store instead) — feeding the empty demo list on a backed session made the
	 * caps silently under-count.
	 */
	bookedShifts: OutletBookedShift[];
}

/**
 * Write counterpart to useOutletToday for the Post Job screen. Each posted shift
 * becomes a backend `POST /shift`; the outlet id is taken from the session
 * identity and the routed agency is derived server-side, so the composer never
 * has to know either. On success the outlet's shift queries are invalidated so
 * Today / History / Calendar refetch the newly posted shifts.
 *
 * Gated on a real session: when there is no outlet identity, `backed` is false
 * and the caller keeps using the demo store instead.
 */
export function useOutletPostJob(): UseOutletPostJob {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletName = identity?.outletName ?? "";
	const queryClient = useQueryClient();

	const todayIso = useMemo(() => getLiveTodayIso(), []);
	const toDate = useMemo(
		() => addDaysToIso(todayIso, CAP_LOOKAHEAD_DAYS),
		[todayIso],
	);

	// Existing shifts + their roster, server-scoped to this outlet, so the daily
	// plan caps count real bookings instead of the always-empty demo store.
	const shiftsQuery = useQuery({
		queryKey: ["outlet", "post-job", "shifts", todayIso, toDate],
		queryFn: () =>
			fetchShifts({ fromDate: todayIso, toDate, pageSize: 200 }, logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
	const assignmentsQuery = useQuery({
		// Same key/fn as useOutletToday so the two screens share one cache entry.
		queryKey: ["outlet", "today", "assignments"],
		queryFn: () => fetchShiftAssignments({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 30_000,
	});

	const bookedShifts = useMemo<OutletBookedShift[]>(() => {
		if (!backed) return [];
		const assignments = assignmentsQuery.data?.data ?? [];
		return (shiftsQuery.data?.data ?? []).map((shift) => ({
			outletName,
			dateIso: shift.shiftDate,
			quantity: shift.quantity,
			// Cancelled / no-show PRs no longer count against the day's named cap.
			requestedPrIds: assignments
				.filter(
					(a) =>
						a.shiftId === shift.id &&
						a.status !== "cancelled" &&
						a.status !== "no_show",
				)
				.map((a) => a.prId),
		}));
	}, [backed, outletName, shiftsQuery.data, assignmentsQuery.data]);

	const mutation = useMutation({
		mutationFn: async (items: OutletShiftPostItem[]) => {
			if (!identity) throw new Error("No outlet session");
			// Post sequentially so a mid-batch failure stops rather than firing the
			// rest — the outlet can retry the remainder from the still-populated form.
			for (const item of items) {
				await createShift(
					createShiftInputFromPost(item, identity.outletId),
					logout,
				);
			}
		},
		onSuccess: () => {
			// Every outlet read query is keyed under "outlet"; the roster grids under
			// "roster". Refetch both so the posted shifts appear immediately.
			queryClient.invalidateQueries({ queryKey: ["outlet"] });
			queryClient.invalidateQueries({ queryKey: ["roster"] });
		},
	});

	return {
		backed,
		postShifts: (items) => mutation.mutateAsync(items),
		isPosting: mutation.isPending,
		bookedShifts,
	};
}
