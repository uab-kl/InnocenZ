import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CreateCutlostRequestInput,
	type CutlostRequestStatus,
	type CutlostRequestWithContext,
	createCutlostRequest,
	decideCutlostRequest,
	listCutlostRequests,
} from "@/services/cutlost";

/**
 * Cut-loss requests from the backend, for whichever side of the conversation is
 * signed in — the endpoint scopes itself (an agency sees requests against its
 * shifts, an outlet the ones at its venues), so this hook passes no org id and
 * therefore cannot ask for somebody else's.
 *
 * `backed` gates the whole thing on a real session. Without one the caller keeps
 * using the demo store, which is what the prototype logins still run on — the
 * same shape `useOutletShiftActions` uses.
 */
export interface UseCutlostRequests {
	/** True on a real signed-in session; false means fall back to the demo store. */
	backed: boolean;
	requests: CutlostRequestWithContext[];
	isLoading: boolean;
	raise: (input: CreateCutlostRequestInput) => Promise<unknown>;
	isRaising: boolean;
	decide: (input: {
		id: string;
		decision: "approve" | "reject";
		reason?: string;
	}) => Promise<unknown>;
	isDeciding: boolean;
}

export function useCutlostRequests(
	filter: { status?: CutlostRequestStatus; shiftId?: string } = {},
): UseCutlostRequests {
	const { logout, isAuthenticated } = useAuth();
	// An outlet identity is not required to READ — the agency side of this queue
	// is the busier one — so the gate is simply "is there a real session".
	const outletIdentity = useMemo(() => getOutletIdentity(), []);
	const backed = isAuthenticated || outletIdentity !== null;
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["cutlost", filter.status ?? "all", filter.shiftId ?? "all"],
		queryFn: () => listCutlostRequests(filter, logout),
		enabled: backed,
	});

	// Both mutations invalidate the roster and outlet reads as well as this
	// queue: approving RELEASES people, so the shift's staffing and every wage on
	// it have just changed. Refetching only the queue would leave the screen
	// showing a PR still on duty who has been sent home.
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["cutlost"] });
		queryClient.invalidateQueries({ queryKey: ["outlet"] });
		queryClient.invalidateQueries({ queryKey: ["roster"] });
	};

	const raise = useMutation({
		mutationFn: (input: CreateCutlostRequestInput) =>
			createCutlostRequest(input, logout),
		onSuccess: invalidate,
	});

	const decide = useMutation({
		mutationFn: (input: {
			id: string;
			decision: "approve" | "reject";
			reason?: string;
		}) => decideCutlostRequest(input.id, input.decision, logout, input.reason),
		onSuccess: invalidate,
	});

	return {
		backed,
		requests: query.data ?? [],
		isLoading: query.isLoading,
		raise: raise.mutateAsync,
		isRaising: raise.isPending,
		decide: decide.mutateAsync,
		isDeciding: decide.isPending,
	};
}
