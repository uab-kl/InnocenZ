import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { removeShift, updateShift } from "@/services/shift";

/**
 * A shift may be withdrawn only while it is still ENTIRELY in the future — from
 * tomorrow onwards. Today's is off limits even before it starts: PRs have
 * planned their day around it, and deleting a shift CASCADES to its
 * `shift_assignment` rows (and from there to swaps and cut-loss requests), so a
 * same-day delete would cancel people who may already be travelling to the venue.
 *
 * Exported and shared with the UI so the button and the server apply one rule —
 * a client-only version is how a screen ends up offering what the API refuses.
 * Compared as `YYYY-MM-DD` strings, which sort correctly and carry no timezone
 * of their own.
 */
export function canDeleteShiftOn(
	shiftDateIso: string,
	todayIso: string,
): boolean {
	return shiftDateIso > todayIso;
}

export interface UseOutletShiftActions {
	/** True on a real signed-in outlet session; false falls back to the demo store. */
	backed: boolean;
	/** Mark a shift's staffing confirmed on the backend (shift status -> confirmed). */
	confirmShift: (shiftId: string) => Promise<void>;
	isConfirming: boolean;
	/** Withdraw a future shift. Today's and past shifts are refused server-side too. */
	deleteShift: (shiftId: string) => Promise<void>;
	isDeleting: boolean;
	/**
	 * Close a finished shift (shift status -> sealed). The server refuses this
	 * for a shift that has not ended yet, so the UI must not offer it earlier —
	 * see the seal guard in `shift.controller.ts`.
	 */
	sealShift: (shiftId: string) => Promise<void>;
	isSealing: boolean;
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

	const remove = useMutation({
		mutationFn: async (shiftId: string) => {
			await removeShift(shiftId, logout);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["outlet"] });
			queryClient.invalidateQueries({ queryKey: ["roster"] });
			// The agency's Outlets demand dashboard reads the same shifts under its
			// own key; without this the withdrawn shift keeps showing there as
			// unstaffed demand.
			queryClient.invalidateQueries({ queryKey: ["agency"] });
		},
	});

	const seal = useMutation({
		mutationFn: async (shiftId: string) => {
			await updateShift(shiftId, { status: "sealed" }, logout);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["outlet"] });
			queryClient.invalidateQueries({ queryKey: ["roster"] });
			// A sealed shift stops being assignable, so the agency's demand views
			// have to hear about it too — same reason the withdraw path invalidates
			// this key.
			queryClient.invalidateQueries({ queryKey: ["agency"] });
		},
	});

	return {
		backed,
		confirmShift: (shiftId) => confirm.mutateAsync(shiftId),
		isConfirming: confirm.isPending,
		deleteShift: (shiftId) => remove.mutateAsync(shiftId),
		isDeleting: remove.isPending,
		sealShift: (shiftId) => seal.mutateAsync(shiftId),
		isSealing: seal.isPending,
	};
}
