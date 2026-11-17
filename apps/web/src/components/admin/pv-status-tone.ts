import { STATUS_TONE_CLASS } from "@/lib/status-tone";
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
/*
 * The three tones come from `lib/status-tone.ts`, which is the one place a
 * tone becomes a class — they were spelled out here, in `statusColors` and in
 * `orgStatusBadgeColors`: three copies of the same values that nothing kept
 * in step.
 *
 * ⚠️ The MAPPING below stays local and must not be folded into that file's
 * `TONE_BY_STATUS`. This is the money domain, where `approved` means the
 * receipt is still WAITING on verification; in the account domain the same
 * word means working. Same colours, different question being answered.
 */
const SETTLED = STATUS_TONE_CLASS.safe;
const WAITING = STATUS_TONE_CLASS.caution;
const DISPUTED = STATUS_TONE_CLASS.warning;

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
