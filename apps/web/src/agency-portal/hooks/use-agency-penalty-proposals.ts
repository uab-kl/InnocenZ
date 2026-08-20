import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchPenaltyProposals } from "@/services/agency-uncharged";

/**
 * A Sunday-start week, `weeksAgo` back — matches the backend payroll cycle.
 *
 * This panel reads weeksAgo = 1, the last COMPLETE week, on purpose. A
 * minimum-shifts breach is not a fact until the week closes: a PR on "1 of 3"
 * on Tuesday has until Saturday to work the other two. Showing that mid-week
 * invites someone to record a charge the PR can still cure — which is exactly
 * what happened before the seal guard existed, and the backend now refuses to
 * seal an unfinished week for the same reason.
 */
function weekIso(
	weeksAgo: number,
	now = new Date(),
): {
	weekStart: string;
	weekEnd: string;
} {
	const sunday = new Date(now);
	sunday.setDate(sunday.getDate() - sunday.getDay() - weeksAgo * 7);
	const end = new Date(sunday);
	end.setDate(sunday.getDate() + 6);
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
			d.getDate(),
		).padStart(2, "0")}`;
	return { weekStart: iso(sunday), weekEnd: iso(end) };
}

/**
 * Who is in breach this week, evaluated by the BACKEND.
 *
 * Manage PR used to compute this in the browser from `pr.shiftsThisWeek`,
 * `lateThisWeek` and `mcThisMonth` — fields that only ever exist on demo PRs.
 * On a real roster every one is undefined, so no rule could fire and the panel
 * permanently read "No active penalties this week" while the backend could see
 * the breaches perfectly well. The evaluator now lives in exactly one place.
 */
export function useAgencyPenaltyProposals(override?: {
	weekStart: string;
	weekEnd: string;
}) {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;
	// Defaults to the CURRENT week. The backend splits the windows per rule:
	// lateness and the MC cap come from this week, minimum-shifts from the one
	// before, since that one is not a fact until the week closes.
	//
	// Callers on a week-tabbed screen pass their own week, because a panel that
	// always asked for today’s would answer the Last Week tab with this
	// week’s breaches — the same fee looking like it belonged to both tabs.
	const currentWeek = useMemo(() => weekIso(0), []);
	const week = override ?? currentWeek;

	const query = useQuery({
		queryKey: [
			"agency-penalty-proposals",
			agencyId ?? "none",
			week.weekStart,
			week.weekEnd,
		],
		queryFn: () =>
			fetchPenaltyProposals(
				agencyId as string,
				week.weekStart,
				week.weekEnd,
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	return {
		backed,
		proposals: query.data?.data?.proposals ?? [],
		totalRm: query.data?.data?.totalRm ?? "0.00",
		count: query.data?.data?.count ?? 0,
		isLoading: backed && query.isLoading,
		isError: query.isError,
		week,
	};
}
