import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
	cancelOutletSwap,
	type CreateOutletSwapInput,
	createOutletSwap,
} from "@/services/outlet-swap";

/**
 * The backend refuses a swap for reasons the agency needs to read verbatim —
 * "That shift is already fully staffed", "This PR already has a swap request
 * awaiting a reply". Those arrive as a 409 with a message; anything else is a
 * genuine fault and gets a generic line rather than leaking an axios string.
 */
function messageFromError(error: unknown): string {
	const response = (error as { response?: { data?: { message?: string } } })
		?.response;
	return response?.data?.message ?? "Could not send the swap request";
}

/**
 * Write path for outlet swaps. Raising one changes nothing on the roster — the
 * request waits at `pending_pr` until the PR answers — but the roster queries
 * are still invalidated so the slot can show that a swap is outstanding.
 */
export function useOutletSwapMutations() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["roster"] });
		queryClient.invalidateQueries({ queryKey: ["outlet-swap"] });
	};

	const request = useMutation({
		mutationFn: (input: CreateOutletSwapInput) =>
			createOutletSwap(input, logout),
		onSuccess: invalidate,
	});

	const cancel = useMutation({
		mutationFn: (id: string) => cancelOutletSwap(id, logout),
		onSuccess: invalidate,
	});

	return {
		request,
		cancel,
		isPending: request.isPending || cancel.isPending,
		/** The server's own refusal text, or null when nothing has failed. */
		errorMessage: request.error
			? messageFromError(request.error)
			: cancel.error
				? messageFromError(cancel.error)
				: null,
	};
}
