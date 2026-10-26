import type {
	PaymentVoucherReceiptStatus,
	PaymentVoucherStatus,
} from "@/services/payment-voucher";

/*
 * The owner's colour code for every receipt/PV surface (23 Aug 2026): green =
 * settled, amber = waiting — pending AND approved share it deliberately — red =
 * disputed. Admin's Payment Vouchers page drew `sent` sky and `signed` violet,
 * two colours the code does not have, so a signed voucher did not read as done;
 * and its receipt list drew `approved` green and `verified` sky, the reverse of
 * what an approved-but-unverified receipt means.
 */
const SETTLED =
	"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
const WAITING =
	"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
const DISPUTED =
	"border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";

export const PV_STATUS_BADGE: Record<PaymentVoucherStatus, string> = {
	pending_review: WAITING,
	// Issued, waiting on the PR's signature.
	sent: WAITING,
	signed: SETTLED,
	paid: SETTLED,
	disputed: DISPUTED,
};

export const RECEIPT_STATUS_BADGE: Record<PaymentVoucherReceiptStatus, string> =
	{
		pending: WAITING,
		approved: WAITING,
		verified: SETTLED,
	};
