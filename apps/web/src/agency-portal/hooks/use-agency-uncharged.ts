import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchAgencyUncharged,
	markUnchargedCollected,
	sealPenaltyWeek,
	type UnchargedResponse,
} from "@/services/agency-uncharged";

/**
 * Sealed-but-uncollected cancellation fees for the signed-in agency.
 *
 * Real sessions only (`getAgencyIdentity()`), like every other backed hook —
 * there is no demo fallback here on purpose. A fabricated "RM 120 outstanding"
 * on a Finance screen is worse than an empty one: this list exists to be acted
 * on, and a demo number invites someone to bill a PR for a shift nobody
 * cancelled.
 */
export function useAgencyUncharged() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;

	const query = useQuery({
		queryKey: ["agency-uncharged", agencyId ?? "none"],
		queryFn: (): Promise<UnchargedResponse> =>
			fetchAgencyUncharged(agencyId as string, logout),
		enabled: backed,
		staleTime: 30_000,
	});

	const markMut = useMutation({
		mutationFn: (vars: {
			assignmentIds: string[];
			chargeIds: string[];
			voucherId: string | null;
		}) =>
			markUnchargedCollected(
				agencyId as string,
				{ assignmentIds: vars.assignmentIds, chargeIds: vars.chargeIds },
				vars.voucherId,
				logout,
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["agency-uncharged"] }),
	});

	const sealMut = useMutation({
		mutationFn: (vars: { weekStart: string; weekEnd: string }) =>
			sealPenaltyWeek(agencyId as string, vars.weekStart, vars.weekEnd, logout),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["agency-uncharged"] }),
	});

	const data = query.data?.data ?? null;

	return {
		backed,
		cancellations: data?.cancellations ?? [],
		penalties: data?.penalties ?? [],
		cancellationsRm: data?.cancellationsRm ?? "0.00",
		penaltiesRm: data?.penaltiesRm ?? "0.00",
		totalRm: data?.totalRm ?? "0.00",
		count: data?.count ?? 0,
		isLoading: backed && query.isLoading,
		isError: query.isError,
		isMarking: markMut.isPending,
		isSealing: sealMut.isPending,
		markCharged: (
			ids: { assignmentIds?: string[]; chargeIds?: string[] },
			voucherId: string | null,
		) =>
			markMut.mutateAsync({
				assignmentIds: ids.assignmentIds ?? [],
				chargeIds: ids.chargeIds ?? [],
				voucherId,
			}),
		sealWeek: (weekStart: string, weekEnd: string) =>
			sealMut.mutateAsync({ weekStart, weekEnd }),
	};
}
