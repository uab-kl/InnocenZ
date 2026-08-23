import {
	derivePrLiveStatus,
	type PrLiveStatus,
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
				fetchPrCommittedWindows({ from: todayIso, to: todayIso }, logout),
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
		for (const a of data.assignments) {
			if (a.shiftDate?.slice(0, 10) !== todayIso) continue;
			if (NON_STAFFING.has(a.status)) continue;
			const person = a.prId;
			ownBooked.add(person);
			if (a.checkInAt && !a.checkOutAt) ownOnDuty.add(person);
		}
		const committedByUser = new Map<string, string[]>();
		for (const w of data.committed) {
			if (!w.slot) continue;
			const arr = committedByUser.get(w.userId) ?? [];
			arr.push(w.slot);
			committedByUser.set(w.userId, arr);
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
