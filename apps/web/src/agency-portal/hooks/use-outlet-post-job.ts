import {
	createShiftInputFromPost,
	type OutletShiftPostItem,
} from "@agency-portal/lib/backend-shift-map";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { createShift } from "@/services/shift";

export interface UseOutletPostJob {
	/** True on a real signed-in outlet session; false falls back to the demo store. */
	backed: boolean;
	/** Post one or more shifts to the backend. Rejects if any shift fails. */
	postShifts: (items: OutletShiftPostItem[]) => Promise<void>;
	isPosting: boolean;
}

/**
 * Write counterpart to useOutletToday for the Post Job screen. Each posted shift
 * becomes a backend `POST /shift`; the outlet id is taken from the session
 * identity and the routed agency is derived server-side, so the composer never
 * has to know either. On success the outlet's shift queries are invalidated so
 * Today / History / Calendar refetch the newly posted shifts.
 *
 * Gated on a real session: when there is no outlet identity, `backed` is false
 * and the caller keeps using the demo store instead.
 */
export function useOutletPostJob(): UseOutletPostJob {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (items: OutletShiftPostItem[]) => {
			if (!identity) throw new Error("No outlet session");
			// Post sequentially so a mid-batch failure stops rather than firing the
			// rest — the outlet can retry the remainder from the still-populated form.
			for (const item of items) {
				await createShift(
					createShiftInputFromPost(item, identity.outletId),
					logout,
				);
			}
		},
		onSuccess: () => {
			// Every outlet read query is keyed under "outlet"; the roster grids under
			// "roster". Refetch both so the posted shifts appear immediately.
			queryClient.invalidateQueries({ queryKey: ["outlet"] });
			queryClient.invalidateQueries({ queryKey: ["roster"] });
		},
	});

	return {
		backed,
		postShifts: (items) => mutation.mutateAsync(items),
		isPosting: mutation.isPending,
	};
}
