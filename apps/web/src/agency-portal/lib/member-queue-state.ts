/**
 * WHAT A MEMBERSHIP ROW MEANS TO THE PERSON READING THE QUEUE.
 *
 * The stored column is one of four words — `pending | active | rejected |
 * inactive` (`MEMBERSHIP_STATUSES`) — and the screen needs a different four,
 * because "inactive" covers somebody who worked here and was switched off while
 * "rejected" covers somebody who was turned down. Those are opposite stories,
 * and a queue that merges them tells the owner the wrong one.
 *
 * ⚠️ A LEAF MODULE, deliberately, with no imports at all.
 *
 * This rule used to live inside `PendingMembersPanel.tsx`, while the counts that
 * have to agree with it sat in a hook and a route — neither of which can import
 * a component without dragging React state, lucide icons and the locale context
 * into its module graph. This portal has already been taken down once by a
 * LATENT circular import that only turned fatal when `tsr generate` re-ordered
 * route imports, and the remedy then was the shape used here: put the shared
 * fact in a leaf everything can reach and nothing can cycle through.
 *
 * ⚠️ Anything unrecognised falls to `deactivated`, never to `declined`. The
 * column is a free varchar at rest, and calling an unknown word a declined
 * application accuses somebody of being turned down when we simply do not know
 * — whereas "no longer active" is true of every non-active row.
 */
export type MemberQueueState =
	| "waiting"
	| "active"
	| "declined"
	| "deactivated";

export function memberQueueState(m: { status: string }): MemberQueueState {
	if (m.status === "active") return "active";
	if (m.status === "pending") return "waiting";
	if (m.status === "rejected") return "declined";
	return "deactivated";
}

/**
 * The one predicate every "how many are waiting?" count must use.
 *
 * ⚠️ `waiting` is `pending` ALONE. Counting `!== "active"` instead is the bug
 * this module exists to prevent: it adds the declined and the deactivated, which
 * are decisions ALREADY TAKEN, so the rail advertises work that is not there.
 * Atlas Agency showed a badge of 2 over a queue reading "Waiting (0) ·
 * Declined (1) · Deactivated (1)" — the 2 was those two rows.
 */
export function isMemberWaiting(m: { status: string }): boolean {
	return memberQueueState(m) === "waiting";
}

/**
 * Which title a REACTIVATION writes — never one the owner did not see.
 *
 * `agency_user.sub_role` survives removal (0160), so the row still says what
 * the person held. The picker opens on that lane when it can be restored from
 * the queue. It cannot for Owner or Guarantor — `approvable` withholds them, the
 * same rule Approve and the server's invite paths follow — and the picker used
 * to fall silently to the FIRST approvable title, so reactivating a former
 * Guarantor quietly wrote Finance over their role. Now `lane` is null until the
 * owner picks one, and the button waits for it.
 *
 * `picked` is the owner's choice for THIS person, if they have made one.
 */
export function reactivationLane(input: {
	heldLane: string;
	picked?: string | null;
	approvable: readonly string[];
}): { lane: string | null; heldRestorable: boolean } {
	const heldRestorable = input.approvable.includes(input.heldLane);
	if (input.picked && input.approvable.includes(input.picked)) {
		return { lane: input.picked, heldRestorable };
	}
	return { lane: heldRestorable ? input.heldLane : null, heldRestorable };
}
