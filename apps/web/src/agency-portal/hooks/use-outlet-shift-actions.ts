import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateShift } from "@/services/shift";

export interface UseOutletShiftActions {
	/** True on a real signed-in outlet session; false falls back to the demo store. */
	backed: boolean;
	/** Mark a shift's staffing confirmed on the backend (shift status -> confirmed). */
	confirmShift: (shiftId: string) => Promise<void>;
	isConfirming: boolean;
}

/**
 * Live-ops writes for the outlet Today / detail panels. The demo store version
 * (`confirmShift`) also pushes local notifications; those are demo-only, so the
 * backed path just persists the status change and lets the outlet's read queries
 * refetch. Assignment-level live-ops (check-in, release early, cut-loss) are not
 * here — those need the shift-assignment write role widened to the outlet first.
 *
 * Gated on a real session: when there is no outlet identity, `backed` is false
 * and the caller keeps using the demo store instead.
 */
export function useOutletShiftActions(): UseOutletShiftActions {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const queryClient = useQueryClient();

	const confirm = useMutation({
		mutationFn: async (shiftId: string) => {
			await updateShift(shiftId, { status: "confirmed" }, logout);
		},
		onSuccess: () => {
			// Every outlet read query is keyed under "outlet"; roster grids under
			// "roster". Refetch both so the confirmed status appears immediately.
			queryClient.invalidateQueries({ queryKey: ["outlet"] });
			queryClient.invalidateQueries({ queryKey: ["roster"] });
		},
	});

	return {
		backed,
		confirmShift: (shiftId) => confirm.mutateAsync(shiftId),
		isConfirming: confirm.isPending,
	};
}
