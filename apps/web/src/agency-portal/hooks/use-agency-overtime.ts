import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
	decideOvertimeClaim,
	fetchPendingOvertime,
	type OvertimeDecisionResult,
	type PendingOvertimeClaim,
} from "@/services/shift-assignment";

const OVERTIME_KEY = ["agency", "overtime-pending"] as const;

/**
 * The agency's overtime worklist.
 *
 * Already agency-scoped server-side (the endpoint resolves the caller's agency
 * and filters on it), so there is no client-side tenant filter here — filtering
 * after the fact is how cross-tenant leaks happen.
 *
 * Nothing in this hook computes money. The amount and the payroll week arrive
 * priced from the server, by the same functions the approval uses, so what the
 * agency approves and what lands on the voucher cannot become two numbers.
 */
export function useAgencyOvertime() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: OVERTIME_KEY,
		queryFn: () => fetchPendingOvertime(logout),
		staleTime: 15_000,
	});

	const decideMut = useMutation({
		mutationFn: (input: {
			assignmentId: string;
			decision: "approve" | "reject";
		}) => decideOvertimeClaim(input.assignmentId, input.decision, logout),
		// Settled, not onSuccess: a 409 means somebody else decided this claim a
		// moment ago, so the list on screen is stale in exactly the case where a
		// refusal fires. Re-fetching on failure too is what makes the row
		// disappear instead of sitting there inviting a second click.
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: OVERTIME_KEY });
			// An approval adds a line to that week's voucher and unblocks its send,
			// so the payroll list is stale as well.
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-vouchers"],
			});
		},
	});

	return {
		claims: (query.data ?? []) as PendingOvertimeClaim[],
		isLoading: query.isLoading,
		error: query.error,
		decide: decideMut.mutateAsync as (input: {
			assignmentId: string;
			decision: "approve" | "reject";
		}) => Promise<OvertimeDecisionResult>,
		isDeciding: decideMut.isPending,
	};
}
