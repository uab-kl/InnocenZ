import { serverMessage } from "@agency-portal/hooks/use-org-members";
import { useStore } from "@agency-portal/lib/store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	type CreatePrPersonnelInput,
	createPrPersonnel,
} from "@/services/pr-personnel";
import {
	approveLeaveRequest,
	createShiftAssignment,
	rejectLeaveRequest,
	removeShiftAssignment,
	updateShiftAssignment,
} from "@/services/shift-assignment";

// There is no `assignmentStatusFromRoster` anymore, and reviving it needs a hard
// look first. It inverted `rosterStatusFromAssignment`, which is NOT invertible:
// that mapping folds `confirmed` and `completed` into one roster status, and
// `assigned`, `en-route` and `on-duty` into another. Sending its output back to
// the server therefore rewrote facts it had merely lost sight of — most
// expensively `completed` → `confirmed`, which drops a worked shift out of the
// weekly voucher run. Its only caller was the roster edit sheet's Save button,
// which had no status control to justify writing one at all.

/**
 * Write counterpart to useRosterSlots — mutations for the roster planning view,
 * each invalidating the roster queries so the view refetches. A slot's id is
 * the shift-assignment id, so the by-id actions map 1:1.
 */
export function useRosterMutations() {
	const { logout } = useAuth();
	const { t } = usePortalLocale();
	// Toast lives on the demo store, which is also the portal-wide toaster on a
	// real session — the same one every other agency screen writes to.
	const { toast } = useStore();
	const queryClient = useQueryClient();
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["roster"] });
	};

	/*
	 * ⚠️ EVERY MUTATION IN THIS HOOK USED TO FAIL SILENTLY.
	 *
	 * Six writes — no-show, unassign, approve leave, reject leave, assign, add PR
	 * — and not one `onError`. The roster simply refetched and looked unchanged,
	 * which is exactly what a SUCCESSFUL no-op looks like. The owner's standing
	 * rule: a decision must show the server's own sentence, because silence
	 * reads as failure and invites a second, harmful click — and here the second
	 * click lands on a PR's shift, or on their MC.
	 *
	 * The SERVER's message, not a generic one: these endpoints answer with WHY
	 * (a decided leave cannot be re-decided, a shift has already started), and
	 * that sentence is the whole value of the refusal.
	 */
	const failed = (fallback: string) => (error: unknown) =>
		toast(serverMessage(error, fallback), "warn");

	// No `cancel` mutation. It existed for one caller — the roster edit sheet's
	// "Cancel shift" button — and that button was two wrong things at once: an
	// agency does not cancel a venue's shift (posting and withdrawing a shift are
	// the OUTLET's, see shift.routes.ts), and what it actually wrote was
	// `status: 'cancelled'` on the ASSIGNMENT, which is what `unassign` below
	// already does under its own name. A PR's own cancellation still exists and
	// still reaches this status — it comes from the PR app via
	// `POST /shift-assignment/mine/:id/cancel`, which is the only place that
	// decision belongs.
	const flagNoShow = useMutation({
		mutationFn: (id: string) =>
			updateShiftAssignment(id, { status: "no_show" }, logout),
		onSuccess: invalidate,
		onError: failed(t.roster.couldNotFlagNoShow),
	});

	const unassign = useMutation({
		mutationFn: (id: string) => removeShiftAssignment(id, logout),
		onSuccess: invalidate,
		onError: failed(t.roster.couldNotUnassign),
	});

	// PR MC/leave decisions (leave_pending rows): approve excuses the shift with
	// no penalty; reject puts the PR back on it.
	const approveLeave = useMutation({
		mutationFn: (id: string) => approveLeaveRequest(id, logout),
		// An approved MC writes a day-block across EVERY agency, so this one is
		// confirmed out loud rather than left to the list quietly changing.
		onSuccess: (result) => {
			invalidate();
			toast(result.message || t.roster.leaveApproved, "success");
		},
		onError: failed(t.roster.couldNotApproveLeave),
	});

	const rejectLeave = useMutation({
		mutationFn: (id: string) => rejectLeaveRequest(id, logout),
		onSuccess: (result) => {
			invalidate();
			toast(result.message || t.roster.leaveRejected, "success");
		},
		onError: failed(t.roster.couldNotRejectLeave),
	});

	const assign = useMutation({
		mutationFn: (vars: { shiftId: string; prId: string; userId?: string }) =>
			createShiftAssignment(
				{ shiftId: vars.shiftId, prId: vars.prId, userId: vars.userId },
				logout,
			),
		onSuccess: (created) => {
			invalidate();
			// The assignment LANDED — this is advice, so it rides on success and reads
			// as a caution rather than a failure. Surfaced here rather than at each call
			// site because every manual assign in the portal goes through this one
			// mutation, and a warning shown by only some of them is worse than none: it
			// teaches that silence means the trip is fine.
			if (created.travelWarning) toast(created.travelWarning, "warn");
		},
		// Double-booking, an outlet cap, a travel clash — the server refuses with
		// the reason, and an assign that silently did nothing looked identical to
		// one that worked until the grid failed to change.
		onError: failed(t.roster.couldNotAssign),
	});

	// Agencies do not create shifts — only outlets post jobs (see shift.routes.ts
	// `canCreate`). The roster's create-shift mutation was removed accordingly.
	const addPr = useMutation({
		mutationFn: (input: CreatePrPersonnelInput) =>
			createPrPersonnel(input, logout),
		onSuccess: invalidate,
		onError: failed(t.roster.couldNotAddPr),
	});

	return {
		flagNoShow,
		unassign,
		assign,
		addPr,
		approveLeave,
		rejectLeave,
	};
}
