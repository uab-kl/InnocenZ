import { writeFailureMessage } from "@agency-portal/hooks/write-failure-message";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	type AutoAssignPair,
	type AutoAssignPlan,
	buildAutoAssignPlan,
	EMPTY_AUTO_ASSIGN_PLAN,
	validateAutoAssignPairs,
} from "@agency-portal/lib/auto-assign";
import {
	addDaysToIso,
	getLiveTodayIso,
	getPayrollWeekSundayIso,
} from "@agency-portal/lib/demo-clock";
import { hasShiftEnded } from "@agency-portal/lib/shift-window";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchOutlets } from "@/services/outlet";
import {
	blockedDatesByPr,
	fetchPrAvailability,
	fetchPrCommittedWindows,
} from "@/services/pr-availability";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import {
	createShiftAssignment,
	fetchShiftAssignments,
} from "@/services/shift-assignment";
import { useAllShiftAssignments } from "./use-all-shift-assignments";

/** The payroll week (Sun–Sat) containing `todayIso`. */
function payrollWeekRange(todayIso: string): { from: string; to: string } {
	const from = getPayrollWeekSundayIso(todayIso);
	return { from, to: addDaysToIso(from, 6) };
}

/**
 * Which dates the plan should fill.
 *
 * `"today"` / `"week"` anchor on the live clock — that is the home card. A
 * `{ dateIso }` scope anchors on a date the agency picked instead, which is how
 * the roster's Planning banner asks for the day it is actually looking at
 * rather than for today.
 */
export type AutoAssignScope = "today" | "week" | { dateIso: string };

/**
 * Backs every auto-assign surface: loads the payroll week's shifts,
 * assignments, PRs and outlets, then proposes who to put on the open slots.
 *
 * The whole week is always loaded because the fairness tie-break counts a PR's
 * shifts across it; `scope` picks the anchor date and which of that week's dates
 * get filled.
 *
 * Read-only until `confirm` runs; the plan is a proposal, never a write.
 */
export function useAutoAssignPlan(scope: AutoAssignScope = "today") {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;

	// Reduced to primitives before any dependency array: callers pass
	// `{ dateIso }` inline, so depending on the object itself would rebuild the
	// plan — and everything memoised below it — on every render.
	const isWeek = scope === "week";
	const anchorIso =
		typeof scope === "string" ? getLiveTodayIso() : scope.dateIso;
	const week = useMemo(() => payrollWeekRange(anchorIso), [anchorIso]);
	const targetDates = useMemo(
		() =>
			isWeek
				? Array.from({ length: 7 }, (_, i) => addDaysToIso(week.from, i))
				: [anchorIso],
		[isWeek, anchorIso, week.from],
	);

	// Query keys mirror useRosterSlots so the roster and this card share one
	// cache, and a write from either invalidates both.
	//
	// ⚠️ ALL THREE PAGE TO EXHAUSTION. They used to ask for `pageSize: 200`/`500`
	// and read the single response — but every controller clamps to 100, so the
	// planner silently saw a TRUNCATED world. The assignments query is the one
	// that bites: it has no date filter and orders `created_at` ASCENDING, so it
	// returned the agency's oldest 100 assignment rows ever. Past 101 lifetime
	// rows, this week's all fall outside it, `staffedByShift` comes back empty,
	// and every shift reads fully unstaffed — tier quotas look free,
	// already-booked PRs get proposed, and `validateAutoAssignPairs` refetches
	// with the same truncated query so it drops none of them. Every pair then
	// 409s. Never swap these back for one big `pageSize`.
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", week.from, week.to],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShifts(
					{ fromDate: week.from, toDate: week.to, page, pageSize: 100 },
					logout,
				),
			),
		enabled: backed,
		staleTime: 30_000,
	});
	// The shared assignments cache. The planner is the surface that proved why it
	// must be paged out: reading the oldest 100 rows made every current shift look
	// unstaffed. See the hook.
	const assignmentsQuery = useAllShiftAssignments({ enabled: backed });
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchPrPersonnel({ page, pageSize: 100 }, logout),
			),
		enabled: backed,
		staleTime: 60_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	// Days the roster's PRs blocked themselves. Shares the roster's query key, so
	// the grid and the planner cannot disagree about who is available — the same
	// shared-key discipline the shifts/assignments reads already follow.
	const availabilityQuery = useQuery({
		queryKey: ["roster", "availability", week.from, week.to],
		queryFn: () =>
			fetchPrAvailability({ from: week.from, to: week.to }, logout),
		enabled: backed,
		staleTime: 30_000,
	});

	/**
	 * WHEN EACH PR IS SPOKEN FOR, BY ANY AGENCY — bare times, no agency, no venue.
	 *
	 * ⚠️ The planner is otherwise BLIND to every rival booking: `fetchShiftAssignments`
	 * is agency-scoped, so the server hands back only our own rows. On 3 Sep 2026
	 * Atlas seated Vicky on a shift posted to two agencies and Why We Met went on
	 * offering her for that same shift, because nothing in its world said
	 * otherwise — a proposal the API would refuse with a deliberately anonymous
	 * 409 the agency could do nothing with.
	 *
	 * The roster grid has read this endpoint for weeks and paints it UNAVAILABLE;
	 * only the planner never asked. Same query key and the same one-day-earlier
	 * `from` as the grid, so the two cannot disagree about who is free and an
	 * overnight window that began the night before is still visible.
	 */
	const committedQuery = useQuery({
		queryKey: ["roster", "committed", addDaysToIso(week.from, -1), week.to],
		queryFn: () =>
			fetchPrCommittedWindows(
				{ from: addDaysToIso(week.from, -1), to: week.to },
				logout,
			),
		enabled: backed,
		staleTime: 30_000,
	});

	// The venue's named asks per shift (0131) — the list response already
	// carries them, agency-scoped by the server, so this is a pure reshape.
	const requestedPrIdsByShift = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const shift of shiftsQuery.data?.data ?? []) {
			const rows = shift.requestedPrs ?? [];
			if (rows.length === 0) continue;
			map.set(shift.id, new Set(rows.map((r) => r.userId)));
		}
		return map;
	}, [shiftsQuery.data]);

	/**
	 * The week's shifts MINUS the ones that are over (owner, 24 Aug 2026: "this
	 * part should also hide the shifts that have ended already").
	 *
	 * The server now refuses to staff an ended shift with a 409, so proposing
	 * one is exactly the failure the `blockedDatesByPr` note below describes —
	 * a preview that promises what the write cannot deliver. Worse here,
	 * because the planner proposes in BULK: one ended shift in the list turns a
	 * single Confirm into a partial success the agency then has to unpick.
	 *
	 * `hasShiftEnded`, never a date comparison — 21 of the live rows cross
	 * midnight, and a 22:00-04:00 shift is perfectly staffable at 01:00.
	 */
	const liveWeekShifts = useMemo(() => {
		const now = new Date();
		return (shiftsQuery.data?.data ?? []).filter(
			(s) => !hasShiftEnded(s.shiftDate, s.slot, now),
		);
	}, [shiftsQuery.data]);

	const plan = useMemo<AutoAssignPlan>(() => {
		if (!backed) return EMPTY_AUTO_ASSIGN_PLAN;
		const outlets = outletsQuery.data?.data ?? [];
		return buildAutoAssignPlan({
			weekShifts: liveWeekShifts,
			weekAssignments: assignmentsQuery.data?.data ?? [],
			prs: prsQuery.data?.data ?? [],
			outletNameById: new Map(outlets.map((o) => [o.id, o.name])),
			// The venue pins, so the planner can ask whether a PR could physically
			// get from one to the next. `lat`/`lng` arrive as decimal STRINGS and an
			// unpinned outlet sends null — kept as null rather than coerced, because
			// Number(null) is 0, which is a real coordinate in the Gulf of Guinea.
			outletPinById: new Map(
				outlets.map((o) => [
					o.id,
					{
						outletId: o.id,
						lat: o.lat === null ? null : Number(o.lat),
						lng: o.lng === null ? null : Number(o.lng),
					},
				]),
			),
			targetDates,
			// Without this the planner proposes PRs on days they have blocked, and
			// every one of those pairings 409s at Confirm — a preview that promises
			// what the write cannot deliver.
			blockedDatesByPr: blockedDatesByPr(availabilityQuery.data ?? []),
			// Rival bookings, as times only — see the query. Without it the planner
			// proposes PRs another agency has already seated, and the refusal that
			// follows cannot explain itself.
			crossAgencyBusy: committedQuery.data ?? [],
			requestedPrIdsByShift,
		});
	}, [
		backed,
		assignmentsQuery.data,
		prsQuery.data,
		outletsQuery.data,
		availabilityQuery.data,
		committedQuery.data,
		targetDates,
		requestedPrIdsByShift,
		liveWeekShifts,
	]);

	/**
	 * Writes the confirmed pairings one at a time.
	 *
	 * The plan came from cached queries, so a seat can be taken from the roster
	 * grid (or by another agency user) while the preview sheet sits open. The
	 * server DOES refuse an overstaffed shift, an over-quota tier and a clashing
	 * PR — but only one row at a time, as a 409 per pair, which reaches the user
	 * as a failure count rather than as a plan. So the rows are refetched and the
	 * plan re-checked here, at the last possible moment, and anything now stale is
	 * dropped with a reason instead of written. A pair the API still rejects is
	 * collected rather than aborting the batch, so one bad row cannot strand the
	 * rest — and its server message is kept, because "please retry" is useless
	 * advice for a tier that is full.
	 *
	 * The refetch pages to exhaustion for the same reason the plan queries do: a
	 * revalidation reading a truncated set silently approves everything.
	 */
	const confirm = useMutation({
		mutationFn: async (pairs: AutoAssignPair[]) => {
			const [freshShifts, freshAssignments, freshPrs, freshBusy] =
				await Promise.all([
				fetchAllPages((page) =>
					fetchShifts(
						{ fromDate: week.from, toDate: week.to, page, pageSize: 100 },
						logout,
					),
				),
				fetchAllPages((page) =>
					fetchShiftAssignments({ page, pageSize: 100 }, logout),
				),
				fetchAllPages((page) =>
					fetchPrPersonnel({ page, pageSize: 100 }, logout),
				),
				// Re-read for the same reason as everything else here: a seat can be
				// taken while the sheet sits open, and a seat taken by ANOTHER agency
				// is invisible in `freshAssignments` — the one race the re-check could
				// not see, and the one that reaches the API as an anonymous 409.
				fetchPrCommittedWindows(
					{ from: addDaysToIso(week.from, -1), to: week.to },
					logout,
				),
			]);
			const { valid, dropped } = validateAutoAssignPairs({
				pairs,
				shifts: freshShifts.data,
				assignments: freshAssignments.data,
				crossAgencyBusy: freshBusy,
				// Needed to bucket each STAFFED seat by tier — without it the
				// re-check cannot tell a full Tier I quota from a free one.
				tierByPrId: new Map(freshPrs.data.map((p) => [p.id, p.tier])),
				// The plan may have been built before the outlets query resolved, when
				// the planner had no pins and could only fail open. This is the last
				// chance to catch a trip nobody can make.
				outletPinById: new Map(
					(outletsQuery.data?.data ?? []).map((o) => [
						o.id,
						{
							outletId: o.id,
							lat: o.lat === null ? null : Number(o.lat),
							lng: o.lng === null ? null : Number(o.lng),
						},
					]),
				),
			});

			const failed: { pair: AutoAssignPair; message: string }[] = [];
			let assigned = 0;
			for (const pair of valid) {
				try {
					await createShiftAssignment(
						{
							shiftId: pair.shiftId,
							prId: pair.prId,
							userId: pair.userId ?? undefined,
						},
						logout,
					);
					assigned += 1;
				} catch (error) {
					failed.push({
						pair,
						// The SERVER's own sentence — "This shift already has all 2 Tier I
						// it asked for" — not axios's "Request failed with status code
						// 409". The raw error used to be kept here and then thrown away by
						// the sheet, so a tier-full refusal surfaced as "please retry",
						// which is advice that can never work: no cancellation opens a
						// third Tier I seat on a shift that asked for two.
						message: writeFailureMessage(error) ?? "Assign failed",
					});
				}
			}
			return { assigned, failed, dropped };
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["roster"] });
		},
	});

	return {
		backed,
		plan,
		targetDates,
		scope,
		isLoading:
			shiftsQuery.isLoading ||
			assignmentsQuery.isLoading ||
			prsQuery.isLoading ||
			outletsQuery.isLoading,
		isError:
			shiftsQuery.isError ||
			assignmentsQuery.isError ||
			prsQuery.isError ||
			outletsQuery.isError,
		confirm,
	};
}
