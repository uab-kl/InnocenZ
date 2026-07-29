import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
	fetchDisputes,
	type PaymentVoucherDispute,
	resolveDispute,
} from "@/services/payment-voucher";

const DISPUTES_KEY = ["agency", "pv-disputes"] as const;

/**
 * The agency's dispute queue.
 *
 * Already agency-scoped server-side through the voucher join, so there is no
 * client-side tenant filter here — a dispute carries no agency of its own, and
 * filtering after the fact is how cross-tenant leaks happen.
 */
export function useAgencyDisputes(openOnly = true) {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: [...DISPUTES_KEY, openOnly],
		queryFn: () => fetchDisputes(logout, openOnly),
	});

	const resolveMut = useMutation({
		mutationFn: (input: {
			disputeId: string;
			outcome: "accepted" | "rejected";
			resolutionNote?: string;
		}) =>
			resolveDispute(
				input.disputeId,
				{ outcome: input.outcome, resolutionNote: input.resolutionNote },
				logout,
			),
		onSuccess: () => {
			// The voucher list also moves: resolving the last open dispute hands
			// the voucher back to 'sent'.
			queryClient.invalidateQueries({ queryKey: DISPUTES_KEY });
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-vouchers"],
			});
		},
	});

	return {
		disputes: (query.data ?? []) as PaymentVoucherDispute[],
		isLoading: query.isLoading,
		error: query.error,
		resolve: resolveMut.mutateAsync,
		isResolving: resolveMut.isPending,
	};
}
