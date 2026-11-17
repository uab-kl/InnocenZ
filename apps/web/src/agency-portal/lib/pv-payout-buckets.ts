import {
	getPvNetTotal,
	type PrPaymentVoucher,
} from "@agency-portal/lib/pr-demo";

/**
 * WHAT THE WEEK'S MONEY IS ACTUALLY DOING, in three figures that add up.
 *
 * The payout card showed ONE number — the total of the `SIGNED` vouchers —
 * under the heading "Pending Payout". That rule is right (only a signed
 * voucher is owed and payable) but on its own it reads as a contradiction: an
 * agency looking at a RM 150.00 voucher saw "RM 0.00" directly above it,
 * because that voucher was still awaiting review. The money had not vanished;
 * it was at a different stage, and the card had no way to say so.
 *
 * So the same total is split by WHAT THE AGENCY MUST DO NEXT:
 *
 *   toPay     SIGNED    — payable now. The figure to send to the bank.
 *   awaiting  everything else unsigned — not payable: nobody has signed it.
 *   disputed  DISPUTED  — held until the claim is settled.
 *
 * ⚠️ PAID is excluded from all three AND from `total`. This card answers "what
 * is still outstanding"; money already sent is History's subject, and folding
 * it in would inflate every figure on the screen.
 *
 * ⚠️ The three ALWAYS sum to `total`, asserted on every mix in the test —
 * including statuses this file does not name. A breakdown whose parts do not
 * add up to its whole is worse than no breakdown, because the reader cannot
 * tell which of the four numbers is the wrong one.
 */
export type PayoutBucket = {
	/** Ringgit, rounded to sen. */
	total: number;
	/** How many vouchers make up that figure. */
	count: number;
};

export type PayoutBuckets = {
	toPay: PayoutBucket;
	awaiting: PayoutBucket;
	disputed: PayoutBucket;
	/** Every outstanding voucher — the three buckets added together. */
	total: PayoutBucket;
};

/** Sen-accurate: sum the floats, then round once. */
function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function bucket(vouchers: PrPaymentVoucher[]): PayoutBucket {
	return {
		total: round2(vouchers.reduce((sum, pv) => sum + getPvNetTotal(pv), 0)),
		count: vouchers.length,
	};
}

export function pvPayoutBuckets(vouchers: PrPaymentVoucher[]): PayoutBuckets {
	// PAID is dropped FIRST, so it can never reach a bucket or the total.
	const outstanding = vouchers.filter((pv) => pv.status !== "PAID");
	const toPay = outstanding.filter((pv) => pv.status === "SIGNED");
	const disputed = outstanding.filter((pv) => pv.status === "DISPUTED");
	/*
	 * ⚠️ Everything else, NOT a list of named statuses. A status added later
	 * (or one this file has not met) lands here and stays inside the total,
	 * rather than disappearing from a breakdown that still claims to be whole.
	 * "Awaiting" is the honest word for it: nobody has signed it, so it is not
	 * payable.
	 */
	const awaiting = outstanding.filter(
		(pv) => pv.status !== "SIGNED" && pv.status !== "DISPUTED",
	);
	return {
		toPay: bucket(toPay),
		awaiting: bucket(awaiting),
		disputed: bucket(disputed),
		total: bucket(outstanding),
	};
}
