import type { PrPvStatus } from "@agency-portal/lib/pr-demo";
import type { PaymentVoucherReceiptStatus } from "@/services/payment-voucher";

/**
 * The voucher states that are WAITING ON THE AGENCY.
 *
 * The Payroll sub-tabs carry a number each, and two of them already meant
 * "outstanding" while two meant "everything in this week" — Disputes and
 * Overtime count only what is open, Vouchers and Receipts counted the lot. Four
 * numbers side by side in one strip have to mean the same kind of thing, or the
 * strip is not a worklist; it is two facts wearing one format.
 *
 * Read one status at a time:
 *
 * - `PENDING_REVIEW` — nobody has checked it. The agency's move.
 * - `SIGNED` — the PR has signed and the money has not left. The agency's move,
 *   and the screen already says so twice: this is what "Pending payout" sums and
 *   what the "To pay" chip narrows to.
 * - `DISPUTED` — a PR is contesting it. The agency's move, and the loudest one.
 * - `SENT` — waiting on the PR to e-sign. NOT the agency's move. Counting it
 *   would put somebody else's homework on this agency's worklist.
 * - `PAID` — finished.
 *
 * A Set rather than a chain of `||`, so adding a state is one line and the
 * membership test cannot fall out of step with the list it is documented by.
 */
export const PV_STATUSES_NEEDING_AGENCY_ACTION: ReadonlySet<PrPvStatus> =
	new Set<PrPvStatus>(["PENDING_REVIEW", "SIGNED", "DISPUTED"]);

export function pvNeedsAgencyAction(status: PrPvStatus): boolean {
	return PV_STATUSES_NEEDING_AGENCY_ACTION.has(status);
}

/**
 * The vouchers that already have an open claim against them.
 *
 * Built once by the caller and passed down, because it is a fact about the
 * WHOLE dispute queue and must not be rebuilt from a window's worth of rows —
 * see `countPvsNeedingAction` for what a windowed version would get wrong.
 */
export function voucherIdsWithOpenDispute(
	openDisputes: readonly { voucherId: string }[],
): ReadonlySet<string> {
	return new Set(openDisputes.map((d) => d.voucherId));
}

/**
 * Vouchers waiting on the agency — WITHOUT counting a disputed voucher twice.
 *
 * The four numbers on this page are summed (the week tab is their total, and the
 * sidebar badge is the same sum over every week), so overlap between two of the
 * terms is not a cosmetic problem: it inflates the answer to "how much is left
 * to do". A voucher at `DISPUTED` normally has one or more open rows in the
 * dispute queue, and those rows are counted by the `disputes` term. Counting the
 * voucher as well says two jobs where there is one, and would have made every
 * total on this page and the rail beside it too high.
 *
 * So `DISPUTED` counts here only when NOTHING in the dispute queue names this
 * voucher. That case is not hypothetical bookkeeping — resolving the last open
 * claim hands the voucher back to `sent`, so a `DISPUTED` voucher with no open
 * row is a voucher the system believes is contested while its queue is empty.
 * Dropping `DISPUTED` outright would have been the tidy fix and would have made
 * exactly that voucher invisible, which is the one outcome worse than a number
 * being too high.
 *
 * ⚠️ `disputedVoucherIds` MUST come from every open dispute, not from the week
 * being counted. Vouchers are scoped by their payroll week and dispute rows by
 * the contested DAY, and the two can land in different windows — so a windowed
 * set would find no row in this week, count the voucher here, and count its row
 * again in the week the claim sits in. The overlap it exists to remove would
 * come back, one week over, where nobody would think to look for it.
 */
export function countPvsNeedingAction(
	pvs: readonly { id: string; status: PrPvStatus }[],
	disputedVoucherIds: ReadonlySet<string>,
): number {
	return pvs.filter((pv) => {
		if (!pvNeedsAgencyAction(pv.status)) return false;
		if (pv.status === "DISPUTED") return !disputedVoucherIds.has(pv.id);
		return true;
	}).length;
}

/**
 * A receipt waits on the agency only while it is `pending`.
 *
 * `approved` and `verified` are both decided, and the distinction between them
 * is about the voucher's own progress, not about anything left to do here. This
 * is the same test the agency home's PENDING RECEIPTS tile uses, deliberately:
 * a receipt at `pending` blocks its voucher from being sent, which is exactly
 * why it belongs on a worklist and its approved siblings do not.
 *
 * ⚠️ `status === "pending"` FULL STOP — matching the panel's `pendingAll`, not
 * its "Waiting on you" chip. That chip is `pending && !isDisputed`, which is a
 * fair thing for a filter to mean and the wrong thing for a worklist: a pending
 * receipt with a claim on it still waits on this agency, and it is the one most
 * worth chasing. Reading the chip instead would hide the loudest row behind a
 * zero.
 */
export function countReceiptsNeedingAction(
	receipts: readonly { status: PaymentVoucherReceiptStatus }[],
): number {
	return receipts.filter((receipt) => receipt.status === "pending").length;
}

/** One payroll week's outstanding work, split the way the sub-tabs split it. */
export interface PayrollWeekWork {
	vouchers: number;
	receipts: number;
	disputes: number;
	overtime: number;
	/**
	 * What the WEEK tab carries: the four sub-tab numbers, added up.
	 *
	 * DERIVED, never passed in. The week tab and the sub-tab strip are two
	 * readings of one pile, and a total that could be supplied separately is a
	 * total that can drift from its own parts — the week saying 5 over a strip
	 * that reads 1+0+0+0 is worse than either number alone, because now neither
	 * can be trusted. Computing it here means "the week tab agrees with its
	 * sub-tabs" is a property of the type, not a thing to remember.
	 */
	total: number;
}

export function payrollWeekWork(parts: {
	vouchers: number;
	receipts: number;
	disputes: number;
	overtime: number;
}): PayrollWeekWork {
	return {
		...parts,
		total: parts.vouchers + parts.receipts + parts.disputes + parts.overtime,
	};
}
