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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchOutlets } from "@/services/outlet";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import {
	createShiftAssignment,
	fetchShiftAssignments,
} from "@/services/shift-assignment";

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
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShiftAssignments({ page, pageSize: 100 }, logout),
			),
		enabled: backed,
		staleTime: 30_000,
	});
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

	const plan = useMemo<AutoAssignPlan>(() => {
		if (!backed) return EMPTY_AUTO_ASSIGN_PLAN;
		const outlets = outletsQuery.data?.data ?? [];
		return buildAutoAssignPlan({
			weekShifts: shiftsQuery.data?.data ?? [],
			weekAssignments: assignmentsQuery.data?.data ?? [],
			prs: prsQuery.data?.data ?? [],
			outletNameById: new Map(outlets.map((o) => [o.id, o.name])),
			targetDates,
		});
	}, [
		backed,
		shiftsQuery.data,
		assignmentsQuery.data,
		prsQuery.data,
		outletsQuery.data,
		targetDates,
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
			const [freshShifts, freshAssignments, freshPrs] = await Promise.all([
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
			]);
			const { valid, dropped } = validateAutoAssignPairs({
				pairs,
				shifts: freshShifts.data,
				assignments: freshAssignments.data,
				// Needed to bucket each STAFFED seat by tier — without it the
				// re-check cannot tell a full Tier I quota from a free one.
				tierByPrId: new Map(freshPrs.data.map((p) => [p.id, p.tier])),
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
