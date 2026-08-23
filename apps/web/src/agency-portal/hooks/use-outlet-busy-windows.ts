import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutletCommittedWindows } from "@/services/pr-availability";

/**
 * When the outlet's pool PRs are already spoken for, as BARE TIME WINDOWS per
 * person per day — the outlet-side half of the cross-agency busy rule: state
 * and times only, never which agency or venue holds them. Feeds the Post Job
 * picker's "On duty" comcard badge.
 *
 * Fetches the span of the dates asked about in one read; empty on demo
 * sessions, so a badge can never be wrong, only absent.
 */
export function useOutletBusyWindows(dateIsos: string[]): {
	byUser: Map<string, Map<string, string[]>>;
	isLoading: boolean;
} {
	const { logout } = useAuth();
	const backed = getOutletIdentity() !== null;
	const sorted = [...dateIsos].filter(Boolean).sort();
	const from = sorted[0];
	const to = sorted[sorted.length - 1];

	const query = useQuery({
		queryKey: ["outlet", "busy-windows", from, to],
		enabled: backed && !!from && !!to,
		staleTime: 30_000,
		queryFn: () => fetchOutletCommittedWindows({ from, to }, logout),
	});

	const byUser = useMemo(() => {
		const map = new Map<string, Map<string, string[]>>();
		for (const row of query.data ?? []) {
			if (!row.slot) continue;
			const byDate = map.get(row.userId) ?? new Map<string, string[]>();
			const arr = byDate.get(row.date) ?? [];
			arr.push(row.slot);
			byDate.set(row.date, arr);
			map.set(row.userId, byDate);
		}
		return map;
	}, [query.data]);

	return { byUser, isLoading: query.isLoading };
}
