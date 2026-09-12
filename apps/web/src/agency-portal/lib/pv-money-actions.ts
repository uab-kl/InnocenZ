import type { agencyCan } from "@agency-portal/lib/agency-rbac";

/**
 * WHO MAY ACT ON A VOUCHER'S MONEY, AND IN WHICH STATE.
 *
 * These four decisions used to live inline in `routes/agency/pv.tsx`, and three
 * of them carried NO permission term at all — so an agency Director, who reaches
 * Payroll & PV legitimately on `payment_voucher:read`, was shown "Edit line
 * items", "Resend to PR" and "Resolve dispute" and collected a 403 from each.
 *
 * They are named and exported here for one reason: they can then be TESTED
 * against the real `agencyCan` and the real generated grants, for every lane and
 * every status. Rendering `PvDetail` to prove the same thing would mean mocking
 * roughly twenty child components and their data hooks — a test that mostly
 * asserts the mocks, and one that cannot run at all on today's data because no
 * voucher is in `DISPUTED` status.
 *
 * ⚠️ EACH ONE IS BOTH HALVES. A permission alone is not enough (a settled
 * voucher must not be re-opened) and a status alone is not enough — that was the
 * bug. Keep the two terms together here rather than splitting them back into the
 * JSX, or the next edit will drop one again.
 */
export type PvStatus =
	| "PENDING_REVIEW"
	| "SENT"
	| "DISPUTED"
	| "SIGNED"
	| "PAID"
	| (string & {});

/**
 * A permission test — normally `useAgencyCan()`.
 *
 * The permission union is taken from `agencyCan`'s own signature rather than
 * imported: `agency-rbac.ts` keeps `Permission` private, and widening that
 * module's API just to name a parameter here would be the tail wagging the dog.
 */
export type AgencyCan = (
	permission: Parameters<typeof agencyCan>[1],
) => boolean;

/**
 * Correcting a disputed voucher's line items.
 *
 * `rows.length > 0` is deliberately NOT folded in: an empty table having nothing
 * to edit is a rendering detail, not a statement about who may act.
 */
export function canEditDisputedLines(can: AgencyCan, status: PvStatus): boolean {
	return can("raisePv") && status === "DISPUTED";
}

/**
 * Re-issuing the voucher to the PR — available while it is out for review or
 * already disputed, because both are states where the PR still has to answer.
 */
export function canResendToPr(can: AgencyCan, status: PvStatus): boolean {
	return can("raisePv") && (status === "DISPUTED" || status === "SENT");
}

/** Settling a dispute and re-issuing the week. */
export function canResolveDispute(can: AgencyCan, status: PvStatus): boolean {
	return can("raisePv") && status === "DISPUTED";
}

/** Sending a reviewed voucher to the PR for signature. */
export function canSendToPr(can: AgencyCan, status: PvStatus): boolean {
	return can("raisePv") && status === "PENDING_REVIEW";
}
