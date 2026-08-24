import {
	derivePrLiveStatus,
	type PrLiveStatus,
	previousDayIso,
	windowMinutes,
	windowsEffectiveOn,
} from "@agency-portal/lib/pr-live-status";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchPrAvailability,
	fetchPrCommittedWindows,
} from "@/services/pr-availability";
import { fetchShiftAssignments } from "@/services/shift-assignment";

/** Assignment states that no longer put a person on a floor. */
const NON_STAFFING = new Set(["cancelled", "no_show", "leave_approved"]);

/**
 * TODAY's live status per PR, for the agency's comcard surfaces (Manage PR).
 *
 * Three reads, one instant: the agency's own assignments (who is checked in
 * right now), the committed windows (own AND rival bookings as bare times —
 * the anonymity the cross-agency rule demands), and the PR's own blocked days.
 * Folded by `derivePrLiveStatus`, so every comcard in the portal answers
 * "what is she doing right now" with the same arithmetic.
 *
 * Keyed by the PR's user id (`pr.id` on managed rows — the same id space the
 * committed read returns). Empty map on demo sessions and while loading, which
 * renders as "no badge" — never a wrong one.
 */
export function useAgencyPrLiveStatus(
	enabled: boolean,
): Map<string, PrLiveStatus> {
	const { logout } = useAuth();
	const todayIso = new Date().toLocaleDateString("en-CA");

	const liveQuery = useQuery({
		queryKey: ["managePr", "live", todayIso],
		enabled,
		staleTime: 30_000,
		queryFn: async () => {
			const [assignments, committed, blocked] = await Promise.all([
				fetchShiftAssignments({ pageSize: 500 }, logout),
				// FROM YESTERDAY. A shift carries only its start date, so a
				// 22:00-04:00 booking is stamped with the night before and a
				// same-day read cannot see it — at 02:00 the PR is on a floor and
				// the pill read "available". The blocked-days read stays on today:
				// a self-declared day off does not run past midnight.
				fetchPrCommittedWindows(
					{ from: previousDayIso(todayIso), to: todayIso },
					logout,
				),
				fetchPrAvailability({ from: todayIso, to: todayIso }, logout),
			]);
			return { assignments: assignments.data ?? [], committed, blocked };
		},
	});

	return useMemo(() => {
		const map = new Map<string, PrLiveStatus>();
		const data = liveQuery.data;
		if (!data) return map;
		const now = new Date();
		const nowMinutes = now.getHours() * 60 + now.getMinutes();

		const ownOnDuty = new Set<string>();
		const ownBooked = new Set<string>();
		const yesterdayIso = previousDayIso(todayIso);
		for (const a of data.assignments) {
			const day = a.shiftDate?.slice(0, 10);
			// YESTERDAY counts too, but only for a shift that actually runs past
			// midnight. Checked in at 22:00 and never checked out IS on duty at
			// 02:00 — dropping the row for being dated yesterday is what let the
			// pill call someone standing on a floor "available".
			const carries =
				day === yesterdayIso &&
				!!a.slot &&
				(windowMinutes(a.slot)?.[1] ?? 0) > 1440;
			if (day !== todayIso && !carries) continue;
			if (NON_STAFFING.has(a.status)) continue;
			const person = a.prId;
			ownBooked.add(person);
			if (a.checkInAt && !a.checkOutAt) ownOnDuty.add(person);
		}
		const committedByUser = new Map<string, string[]>();
		const committedByUserDate = new Map<string, Map<string, string[]>>();
		for (const w of data.committed) {
			if (!w.slot) continue;
			const byDate = committedByUserDate.get(w.userId) ?? new Map();
			const day = w.date.slice(0, 10);
			byDate.set(day, [...(byDate.get(day) ?? []), w.slot]);
			committedByUserDate.set(w.userId, byDate);
		}
		// Folded to TODAY's frame — yesterday's overnight tail arrives rebased as
		// `00:00 - 04:00`, so `windowContains(now)` inside `derivePrLiveStatus`
		// asks the right question at 02:00.
		for (const [userId, byDate] of committedByUserDate) {
			const eff = windowsEffectiveOn(byDate, todayIso);
			if (eff.length > 0) committedByUser.set(userId, eff);
		}
		const blockedUsers = new Set(data.blocked.map((b) => b.userId));

		const everyone = new Set<string>([
			...ownBooked,
			...committedByUser.keys(),
			...blockedUsers,
		]);
		for (const userId of everyone) {
			map.set(
				userId,
				derivePrLiveStatus({
					blockedToday: blockedUsers.has(userId),
					ownOnDuty: ownOnDuty.has(userId),
					ownBookedToday: ownBooked.has(userId),
					committedToday: committedByUser.get(userId) ?? [],
					nowMinutes,
				}),
			);
		}
		return map;
	}, [liveQuery.data, todayIso]);
}
