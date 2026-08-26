import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	AgencyReceipt,
	PaymentVoucherReceiptStatus,
} from "@/services/payment-voucher";
import { isDisputed } from "./receipt-disputes";

/**
 * ONE TAG FOR ONE RECEIPT — the word and the colour, in one place.
 *
 * Three panels drew this pill and one of them disagreed: the dispute queue
 * painted `approved` GREEN and called `pending` "Pending", while the receipts
 * feed and the verify card used amber and "Waiting on you". Same receipt, two
 * colours and two words, depending on which screen you were standing on.
 *
 * Dictionary KEYS, not finished strings — this is module scope, where the
 * locale hook cannot run. The record keys stay the API's status values.
 */

/**
 * "Waiting on you", not "Pending" — the label states whose move it is. A pending
 * receipt is the reason a voucher will not send, so the word has to carry that.
 */
export const RECEIPT_STATUS_LABEL: Record<
	PaymentVoucherReceiptStatus,
	keyof PortalTranslations["receipts"]
> = {
	pending: "waitingOnYou",
	approved: "approved",
	verified: "verified",
};

/**
 * The owner's platform colour code (23 Aug 2026): green = settled (verified),
 * amber = waiting — and PENDING and APPROVED deliberately share it ("approved
 * yellow warning colour same with Pending"; the word carries the difference),
 * red = disputed. Same map as the PR app, because the two describe one receipt.
 */
export const RECEIPT_STATUS_VARIANT: Record<
	PaymentVoucherReceiptStatus,
	"amber" | "green" | "ink"
> = {
	pending: "amber",
	approved: "amber",
	verified: "green",
};

export type ReceiptTag = {
	variant: "amber" | "green" | "ink" | "red";
	/** Key into `t.receipts` — resolved by the caller against its own locale. */
	labelKey: keyof PortalTranslations["receipts"];
};

/**
 * The tag a receipt row shows — and an OPEN CLAIM OWNS IT.
 *
 * Owner's rule, 26 Aug 2026: *"the 'verified' tag should be replaced by the
 * 'Disputed' tag"*. It first shipped as two pills side by side, on the
 * reasoning that "have we checked this paper" and "is the PR arguing with it"
 * are different questions. They are — but a green VERIFIED reads as SETTLED,
 * and nothing about a receipt under a live claim is settled. Two tags, one
 * saying settled and one saying contested, leave the reader to arbitrate; the
 * row has to state the fact that decides what happens next.
 *
 * The review state is not lost — it stays on the row's own "Reviewed by …"
 * line, which is where it belongs once it is no longer the headline.
 */
export function receiptStatusTag(receipt: AgencyReceipt): ReceiptTag {
	if (isDisputed(receipt)) return { variant: "red", labelKey: "disputed" };
	return {
		variant: RECEIPT_STATUS_VARIANT[receipt.status],
		labelKey: RECEIPT_STATUS_LABEL[receipt.status],
	};
}
