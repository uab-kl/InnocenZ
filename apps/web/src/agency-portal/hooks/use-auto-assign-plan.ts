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
 * Backs the home "Assign available PR" card: loads the payroll week's shifts,
 * assignments, PRs and outlets, then proposes who to put on the open slots.
 *
 * The whole week is always loaded because the fairness tie-break counts a PR's
 * shifts across it; `scope` only decides which dates get filled — "today" now,
 * "week" when the agency wants the card to plan the full week.
 *
 * Read-only until `confirm` runs; the plan is a proposal, never a write.
 */
export function useAutoAssignPlan(scope: "today" | "week" = "today") {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;

	const todayIso = getLiveTodayIso();
	const week = useMemo(() => payrollWeekRange(todayIso), [todayIso]);
	const targetDates = useMemo(
		() =>
			scope === "today"
				? [todayIso]
				: Array.from({ length: 7 }, (_, i) => addDaysToIso(week.from, i)),
		[scope, todayIso, week.from],
	);

	// Query keys mirror useRosterSlots so the roster and this card share one
	// cache, and a write from either invalidates both.
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", week.from, week.to],
		queryFn: () =>
			fetchShifts(
				{ fromDate: week.from, toDate: week.to, pageSize: 200 },
				logout,
			),
		enabled: backed,
		staleTime: 30_000,
	});
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		queryFn: () => fetchShiftAssignments({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 30_000,
	});
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
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
	 * The plan came from cached queries, and `POST /shift-assignment` enforces
	 * only agency ownership — it will happily overstaff a shift past its
	 * `quantity` or double-book a PR. So the rows are refetched and the plan
	 * re-checked here, at the last possible moment, and anything now stale is
	 * dropped instead of written. A pair the API still rejects is collected
	 * rather than aborting the batch, so one bad row cannot strand the rest.
	 */
	const confirm = useMutation({
		mutationFn: async (pairs: AutoAssignPair[]) => {
			const [freshShifts, freshAssignments] = await Promise.all([
				fetchShifts(
					{ fromDate: week.from, toDate: week.to, pageSize: 200 },
					logout,
				),
				fetchShiftAssignments({ pageSize: 500 }, logout),
			]);
			const { valid, dropped } = validateAutoAssignPairs({
				pairs,
				shifts: freshShifts.data,
				assignments: freshAssignments.data,
			});

			const failed: { pair: AutoAssignPair; message: string }[] = [];
			let assigned = 0;
			for (const pair of valid) {
				try {
					await createShiftAssignment(
						{ shiftId: pair.shiftId, prId: pair.prId },
						logout,
					);
					assigned += 1;
				} catch (error) {
					failed.push({
						pair,
						message: error instanceof Error ? error.message : "Assign failed",
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
