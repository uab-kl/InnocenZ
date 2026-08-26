import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	AgencyReceipt,
	AgencyReceiptDispute,
	DisputeComponent,
	PaymentVoucherDispute,
} from "@/services/payment-voucher";

/**
 * WHICH RECEIPTS A PR IS ARGUING WITH — one rule, read by every agency screen
 * that shows a receipt.
 *
 * The link itself is computed on the SERVER (`listAgencyReceipts`) and arrives
 * on `receipt.disputes`. This module only reads it. That matters because the
 * link is not a single comparison: a claim may NAME one receipt (`receiptId`,
 * migration 0088), or name none and cover the whole day and bucket, in which
 * case every receipt with a line of that date and kind is under it. Two screens
 * each deriving that for themselves is how a badge and a queue come to disagree
 * about the same paper.
 */

/**
 * The PR app's own words for each bucket, so both sides read the same.
 *
 * Dictionary KEYS, not finished strings — this is module scope, where the
 * locale hook cannot run. The record keys stay the API's component values.
 * Shared so the queue and the receipts list cannot name the same bucket two
 * different things.
 */
export const DISPUTE_COMPONENT_LABEL: Record<
	DisputeComponent,
	keyof PortalTranslations["money"]
> = {
	wages: "dailyWages",
	drinks: "drinks",
	tips: "tips",
	others: "others",
};

/** A claim nobody has decided yet. `outcome` stays null until somebody does. */
export const isOpenClaim = (dispute: { outcome: string | null }): boolean =>
	!dispute.outcome;

/**
 * The claims still awaiting a decision on this receipt.
 *
 * A settled one is deliberately excluded: "the PR contested this and we
 * rejected it" is history, and badging it red forever would put a permanent
 * warning on a receipt nobody is arguing about any more.
 */
export function openDisputesFor(
	receipt: AgencyReceipt,
): AgencyReceiptDispute[] {
	return (receipt.disputes ?? []).filter(isOpenClaim);
}

/** Is the PR contesting money on this receipt right now? */
export const isDisputed = (receipt: AgencyReceipt): boolean =>
	openDisputesFor(receipt).length > 0;

/**
 * The receipts one dispute is actually ABOUT — the inverse lookup, for the
 * queue that shows the evidence behind a claim.
 *
 * Reads the server's own link, so this and the badge above cannot disagree.
 *
 * The `disputes === undefined` branch is not defensive padding: a backend that
 * has not restarted since this field shipped omits it entirely, and returning
 * [] there would blank the evidence block under every claim — telling the
 * reviewer there is no receipt behind a figure when there is one. So when NO
 * row carries the field, fall back to the derivation the panel used before;
 * when any row does, trust it.
 */
export function receiptsForDispute(
	dispute: PaymentVoucherDispute,
	receipts: AgencyReceipt[],
): AgencyReceipt[] {
	const serverAnswered = receipts.some((r) => r.disputes !== undefined);
	if (serverAnswered) {
		return receipts.filter((r) =>
			(r.disputes ?? []).some((d) => d.id === dispute.id),
		);
	}
	// Legacy path — the same two rules the server now applies, kept only for an
	// old backend. Delete it once nothing serves a feed without `disputes`.
	if (dispute.receiptId) {
		return receipts.filter((r) => r.id === dispute.receiptId);
	}
	return receipts.filter(
		(r) =>
			r.voucherId === dispute.voucherId &&
			r.lines.some(
				(l) =>
					l.lineDate === dispute.disputeDate && l.kind === dispute.component,
			),
	);
}
