import type { RosterSlotStatus } from "@agency-portal/lib/agency-demo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
	type CreatePrPersonnelInput,
	createPrPersonnel,
} from "@/services/pr-personnel";
import {
	createShiftAssignment,
	removeShiftAssignment,
	type ShiftAssignmentStatus,
	updateShiftAssignment,
} from "@/services/shift-assignment";

/**
 * Inverse of the read-path mapping: a roster status the user picks in the
 * planning UI back to the backend assignment status. Statuses with no backend
 * equivalent (swaps, outlet-pending) return undefined and are left to their
 * demo-only features.
 */
export function assignmentStatusFromRoster(
	status: RosterSlotStatus,
): ShiftAssignmentStatus | undefined {
	switch (status) {
		case "assignment-pending":
			return "assigned";
		case "scheduled":
		case "en-route":
		case "on-duty":
			return "confirmed";
		case "unavailable":
			return "cancelled";
		default:
			return undefined;
	}
}

/**
 * Write counterpart to useRosterSlots — mutations for the roster planning view,
 * each invalidating the roster queries so the view refetches. A slot's id is
 * the shift-assignment id, so the by-id actions map 1:1.
 */
export function useRosterMutations() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["roster"] });
	};

	const setStatus = useMutation({
		mutationFn: (vars: { id: string; status: ShiftAssignmentStatus }) =>
			updateShiftAssignment(vars.id, { status: vars.status }, logout),
		onSuccess: invalidate,
	});

	const cancel = useMutation({
		mutationFn: (id: string) =>
			updateShiftAssignment(id, { status: "cancelled" }, logout),
		onSuccess: invalidate,
	});

	const flagNoShow = useMutation({
		mutationFn: (id: string) =>
			updateShiftAssignment(id, { status: "no_show" }, logout),
		onSuccess: invalidate,
	});

	const unassign = useMutation({
		mutationFn: (id: string) => removeShiftAssignment(id, logout),
		onSuccess: invalidate,
	});

	const assign = useMutation({
		mutationFn: (vars: { shiftId: string; prId: string }) =>
			createShiftAssignment({ shiftId: vars.shiftId, prId: vars.prId }, logout),
		onSuccess: invalidate,
	});

	// Agencies do not create shifts — only outlets post jobs (see shift.routes.ts
	// `canCreate`). The roster's create-shift mutation was removed accordingly.
	const addPr = useMutation({
		mutationFn: (input: CreatePrPersonnelInput) =>
			createPrPersonnel(input, logout),
		onSuccess: invalidate,
	});

	return { setStatus, cancel, flagNoShow, unassign, assign, addPr };
}
