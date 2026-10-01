import {
	fetchAllOutletAssignments,
	fetchAllOutletShifts,
	outletAssignmentsKey,
} from "@agency-portal/hooks/use-outlet-shared-queries";
import {
	createShiftInputFromPost,
	localDateIso,
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
import { createShiftsBatch, type Shift } from "@/services/shift";
import type { ShiftAssignment } from "@/services/shift-assignment";

// Booking caps are daily and forward-looking, but the composer can schedule
// well ahead, so cover a generous horizon. Only same-date shifts count, so a
// wide window just guarantees coverage — it never inflates a day's total.
const CAP_LOOKAHEAD_DAYS = 120;

/**
 * The days Post Job reads, and the narrower days its CAPS count.
 *
 * The clash check needs one day more on each side than the caps do. An
 * overnight shift belongs to the day it STARTS, so last night's 22:00 - 04:00 is
 * filed under yesterday and still runs into this morning — reading from today
 * meant a 02:00 post this morning never met it, and only the server's 409 said
 * so. The server looks ±1 day for the same reason (`listByOutletAroundDate`).
 *
 * The caps keep their own window: a PAST day must never count towards a daily
 * limit, and the Subscription page reads its peak day from the same list.
 */
export function postJobWindows(todayIso: string): {
	fetchFrom: string;
	fetchTo: string;
	capFrom: string;
	capTo: string;
} {
	const capTo = addDaysToIso(todayIso, CAP_LOOKAHEAD_DAYS);
	return {
		fetchFrom: addDaysToIso(todayIso, -1),
		fetchTo: addDaysToIso(capTo, 1),
		capFrom: todayIso,
		capTo,
	};
}

/**
 * Backend shifts -> the booked rows the caps and the clash check read.
 * Pure, so the overnight and window rules can be pinned without a server.
 */
export function bookedShiftsFromBackend(input: {
	shifts: Shift[];
	assignments: ShiftAssignment[];
	outletName: string;
}): OutletBookedShift[] {
	const { shifts, assignments, outletName } = input;
	return shifts.map((shift) => ({
		outletName,
		// Normalised like every other outlet screen, so a timestamp-shaped date
		// can never file a shift under the wrong day.
		dateIso: localDateIso(shift.shiftDate),
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
}

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
	 * Post one or more shifts to the backend in ONE request, all or nothing.
	 * Resolves with the server's own confirmation ("Posted 3 shifts"); rejects
	 * with the server's refusal, and then NOTHING was posted — the caller keeps
	 * its form exactly as it was.
	 *
	 * `agencyIds` names which of the venue's approved agencies receive the job
	 * (0124); omit to reach all of them.
	 */
	postShifts: (
		items: OutletShiftPostItem[],
		agencyIds?: string[],
	) => Promise<string>;
	isPosting: boolean;
	/**
	 * The outlet's already-booked shifts over the cap horizon, for daily
	 * plan-limit counting. Empty on a demo session (the caller counts the demo
	 * store instead) — feeding the empty demo list on a backed session made the
	 * caps silently under-count.
	 */
	bookedShifts: OutletBookedShift[];
	/**
	 * The same rows plus the day either side — what the CLASH check compares
	 * against, so last night's overnight shift meets this morning's post. Never
	 * counted towards a cap. Empty on a demo session, like `bookedShifts`.
	 */
	clashShifts: OutletBookedShift[];
}

/**
 * Write counterpart to useOutletToday for the Post Job screen. Everything the
 * composer posts goes as ONE backend `POST /shift/batch`, all or nothing; the
 * outlet id is taken from the session identity and the routed agency is derived
 * server-side, so the composer never has to know either. On success the outlet's
 * shift queries are invalidated so Today / History / Calendar refetch the newly
 * posted shifts.
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
	const windows = useMemo(() => postJobWindows(todayIso), [todayIso]);

	// Existing shifts + their roster, pinned to THIS venue — "server-scoped"
	// was the union of every venue the account holds, so a two-venue operator
	// had venue B's headcount counted against A's PR-per-day plan cap, and Post
	// Job refused a post A was entitled to. Same pin as use-outlet-ratings; the
	// server ANDs outletId inside scope, so it can only narrow.
	const outletId = identity?.outletId ?? "";
	const shiftsQuery = useQuery({
		queryKey: [
			"outlet",
			"post-job",
			"shifts",
			outletId,
			windows.fetchFrom,
			windows.fetchTo,
		],
		// Paged to exhaustion — a single page stops at 100 rows, silently.
		queryFn: () =>
			fetchAllOutletShifts(
				{ outletId, fromDate: windows.fetchFrom, toDate: windows.fetchTo },
				logout,
			),
		enabled: backed && Boolean(outletId),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
	const assignmentsQuery = useQuery({
		// Same key/fn as useOutletToday so the two screens share one cache entry.
		queryKey: outletAssignmentsKey,
		queryFn: () => fetchAllOutletAssignments({}, logout),
		enabled: backed,
		staleTime: 30_000,
	});

	const clashShifts = useMemo<OutletBookedShift[]>(() => {
		if (!backed) return [];
		return bookedShiftsFromBackend({
			shifts: shiftsQuery.data?.data ?? [],
			assignments: assignmentsQuery.data?.data ?? [],
			outletName,
		});
	}, [backed, outletName, shiftsQuery.data, assignmentsQuery.data]);

	const bookedShifts = useMemo<OutletBookedShift[]>(
		() =>
			clashShifts.filter(
				(s) => s.dateIso >= windows.capFrom && s.dateIso <= windows.capTo,
			),
		[clashShifts, windows],
	);

	const mutation = useMutation({
		mutationFn: async (input: {
			items: OutletShiftPostItem[];
			agencyIds?: string[];
		}) => {
			if (!identity) throw new Error("No outlet session");
			// ONE request, ALL OR NOTHING. This used to post one `POST /shift` at a
			// time, so a refusal halfway (the plan's daily cap, a clash) left the
			// earlier shifts written while the form still held every one of them: a
			// retry double-posted or was refused as a clash with the shifts it had
			// just written, and `onSuccess` never ran, so the ones that did post did
			// not even appear until something refetched. The server now checks the
			// whole batch first and writes it in one transaction, or writes nothing.
			const { message } = await createShiftsBatch(
				input.items.map((item) =>
					createShiftInputFromPost(item, identity.outletId, input.agencyIds),
				),
				logout,
			);
			return message;
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
		clashShifts,
	};
}
