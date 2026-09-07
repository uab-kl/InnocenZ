import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchAgencyUncharged,
	markUnchargedCollected,
	sealPenaltyWeek,
	type UnchargedResponse,
	voidPenaltyCharge,
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

	/**
	 * CANCEL recorded penalties so they are never billed (0151).
	 *
	 * Sequential rather than parallel: each void is its own decision on its own
	 * row, and the server refuses one that is already on a voucher. Firing them
	 * together would make a partial failure impossible to describe — some voided,
	 * some refused, one message. In order, the first refusal is the answer.
	 */
	const voidMut = useMutation({
		mutationFn: async (vars: {
			chargeIds: string[];
			reason?: string | null;
		}) => {
			let voided = 0;
			for (const id of vars.chargeIds) {
				const result = await voidPenaltyCharge(
					agencyId as string,
					id,
					vars.reason ?? null,
					logout,
				);
				if (result.success) voided += 1;
			}
			return { voided };
		},
		// Settled, not onSuccess: a refusal means this list is stale in exactly
		// the case where the screen most needs re-reading.
		onSettled: () =>
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
		isVoiding: voidMut.isPending,
		voidCharges: (chargeIds: string[], reason?: string | null) =>
			voidMut.mutateAsync({ chargeIds, reason }),
	};
}
