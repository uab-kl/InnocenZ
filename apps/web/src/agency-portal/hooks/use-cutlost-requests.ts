import { serverMessage } from "@agency-portal/hooks/use-org-members";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useStore } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
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
	/**
	 * ⚠️ NEITHER OF THESE REJECTS ANY MORE, and that is deliberate.
	 *
	 * They used to be `mutateAsync`, and every one of their four call sites
	 * invoked them as `void cutlost.raise(...)` / `void liveCutlost.decide(...)`.
	 * A rejecting promise thrown into `void` is an unhandled rejection: nothing
	 * on screen, no refetch, and the request still sitting there marked pending
	 * — which is exactly what the click not registering looks like. On approve
	 * that invites a second press at a decision which SEALS a pro-rated wage on
	 * every named PR.
	 *
	 * The hook reports the outcome itself now, so the promise settling is no
	 * longer how a caller learns anything. Await it only to know the write has
	 * finished, never to catch it.
	 */
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
	const { t } = usePortalLocale();
	const { toast } = useStore();
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

	const failed = (fallback: string) => (error: unknown) =>
		toast(serverMessage(error, fallback), "warn");

	const raise = useMutation({
		mutationFn: (input: CreateCutlostRequestInput) =>
			createCutlostRequest(input, logout),
		onSuccess: () => {
			invalidate();
			toast(t.agencyPending.cutlostRaised, "success");
		},
		onError: failed(t.agencyPending.couldNotRaiseCutlost),
	});

	const decide = useMutation({
		mutationFn: (input: {
			id: string;
			decision: "approve" | "reject";
			reason?: string;
		}) => decideCutlostRequest(input.id, input.decision, logout, input.reason),
		onSuccess: (result, input) => {
			invalidate();
			toast(
				result.message ||
					(input.decision === "approve"
						? t.agencyPending.cutlostApproved
						: t.agencyPending.cutlostRejected),
				"success",
			);
			/*
			 * A SECOND, louder sentence for the half-applied case.
			 *
			 * The endpoint reports `already_closed` / `missing` rows instead of
			 * throwing — by design, so one stale assignment cannot abort a plan
			 * that has already released the rest. Nothing rendered that report,
			 * so the design's whole benefit was lost: the operator saw an approved
			 * request and a roster that still had someone on it. Raised only when
			 * some row really was skipped; a clean approval says nothing extra.
			 */
			const skipped = (result.released ?? []).filter(
				(row) => row.outcome === "already_closed" || row.outcome === "missing",
			).length;
			if (skipped > 0) {
				toast(
					fill(t.agencyPending.cutlostPartlyApplied, { n: skipped }),
					"warn",
				);
			}
		},
		onError: failed(t.agencyPending.couldNotDecideCutlost),
	});

	return {
		backed,
		requests: query.data ?? [],
		isLoading: query.isLoading,
		// Swallowed AFTER `onError` has spoken — see the interface note. Returning
		// the error rather than re-throwing keeps `void raise(...)` from becoming
		// an unhandled rejection while leaving an awaiting caller able to tell a
		// refusal from a success.
		raise: (input) => raise.mutateAsync(input).catch((error) => error),
		isRaising: raise.isPending,
		decide: (input) => decide.mutateAsync(input).catch((error) => error),
		isDeciding: decide.isPending,
	};
}
