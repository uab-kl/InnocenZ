import {
	createShiftInputFromPost,
	normalizedSlotLabel,
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
	/**
	 * The booked slot, normalized to "HH:MM - HH:MM" when it parses. Carried so the
	 * composer's clash check can compare a new shift's time against what is already
	 * booked — the daily caps only ever needed the date, which is exactly why two
	 * shifts at the SAME time passed every check this hook fed.
	 */
	shift: string;
	/** Display only — what a clash warning calls the shift it collided with. */
	event: string;
}

export interface UseOutletPostJob {
	/** True on a real signed-in outlet session; false falls back to the demo store. */
	backed: boolean;
	/**
	 * Post one or more shifts to the backend. Rejects if any shift fails.
	 *
	 * `agencyIds` names which of the venue's approved agencies receive the job
	 * (0124); omit to reach all of them.
	 */
	postShifts: (
		items: OutletShiftPostItem[],
		agencyIds?: string[],
	) => Promise<void>;
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

	// Existing shifts + their roster, pinned to THIS venue — "server-scoped"
	// was the union of every venue the account holds, so a two-venue operator
	// had venue B's headcount counted against A's PR-per-day plan cap, and Post
	// Job refused a post A was entitled to. Same pin as use-outlet-ratings; the
	// server ANDs outletId inside scope, so it can only narrow.
	const outletId = identity?.outletId ?? "";
	const shiftsQuery = useQuery({
		queryKey: ["outlet", "post-job", "shifts", outletId, todayIso, toDate],
		queryFn: () =>
			fetchShifts({ outletId, fromDate: todayIso, toDate, pageSize: 200 }, logout),
		enabled: backed && Boolean(outletId),
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
			// Same expression the Today/Calendar cards render, so a warning names the
			// other shift exactly as the operator sees it listed.
			shift: normalizedSlotLabel(shift.slot),
			event: shift.eventName ?? "",
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
		mutationFn: async (input: {
			items: OutletShiftPostItem[];
			agencyIds?: string[];
		}) => {
			if (!identity) throw new Error("No outlet session");
			// Post sequentially so a mid-batch failure stops rather than firing the
			// rest — the outlet can retry the remainder from the still-populated form.
			for (const item of input.items) {
				await createShift(
					createShiftInputFromPost(item, identity.outletId, input.agencyIds),
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
		postShifts: (items, agencyIds) =>
			mutation.mutateAsync({ items, agencyIds }),
		isPosting: mutation.isPending,
		bookedShifts,
	};
}
