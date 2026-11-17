import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";
import { describe, expect, it } from "vitest";
import { pvPayoutBuckets } from "./pv-payout-buckets";

/**
 * A voucher with just enough shape for `getPvNetTotal`, which sums `rows[].amt`
 * and subtracts `deduct`, floored at 0. One wage line keeps each fixture
 * readable: net is `amount - deduct`.
 *
 * ⚠️ `desc` matters. `getPvRowSubtotal` drops any row whose description
 * mentions "withdrawal" or "advance" — money already handed over is not
 * earnings — so a fixture must not name its line that way by accident.
 */
function pv(
	status: PrPaymentVoucher["status"],
	amount: number,
	deduct = 0,
	desc = "wage",
): PrPaymentVoucher {
	return {
		id: `${status}-${amount}-${deduct}`,
		status,
		deduct,
		rows: [{ desc, amt: amount }],
	} as unknown as PrPaymentVoucher;
}

describe("pvPayoutBuckets", () => {
	/*
	 * THE RULE THE CARD RESTS ON. If the parts do not add up to the whole, a
	 * reader cannot tell which of the four figures is wrong — so this is
	 * asserted on every mix below, not only the tidy one.
	 */
	function expectPartsSumToWhole(vouchers: PrPaymentVoucher[]) {
		const b = pvPayoutBuckets(vouchers);
		expect(
			Math.round((b.toPay.total + b.awaiting.total + b.disputed.total) * 100) /
				100,
		).toBe(b.total.total);
		expect(b.toPay.count + b.awaiting.count + b.disputed.count).toBe(
			b.total.count,
		);
	}

	it("splits a mixed week into three buckets that add up", () => {
		const rows = [
			pv("SIGNED", 150),
			pv("SIGNED", 216.67),
			pv("PENDING_REVIEW", 68.33),
			pv("SENT", 100),
			pv("DISPUTED", 50),
		];
		const b = pvPayoutBuckets(rows);
		expect(b.toPay).toEqual({ total: 366.67, count: 2 });
		expect(b.awaiting).toEqual({ total: 168.33, count: 2 });
		expect(b.disputed).toEqual({ total: 50, count: 1 });
		expect(b.total).toEqual({ total: 585, count: 5 });
		expectPartsSumToWhole(rows);
	});

	/*
	 * The exact screen that prompted this: ONE voucher awaiting review. The old
	 * card printed "RM 0.00" above it, because it counted SIGNED alone.
	 */
	it("shows an awaiting voucher instead of reporting zero", () => {
		const b = pvPayoutBuckets([pv("PENDING_REVIEW", 150)]);
		expect(b.toPay.total).toBe(0);
		expect(b.awaiting.total).toBe(150);
		expect(b.total.total).toBe(150);
	});

	// PAID is History's subject; counting it here would inflate every figure.
	it("excludes paid vouchers from every bucket and from the total", () => {
		const rows = [pv("PAID", 999), pv("SIGNED", 10)];
		const b = pvPayoutBuckets(rows);
		expect(b.total).toEqual({ total: 10, count: 1 });
		expectPartsSumToWhole(rows);
	});

	/*
	 * An unknown status must land in `awaiting` and stay inside the total — not
	 * vanish from a breakdown that still claims to be whole.
	 */
	it("keeps an unrecognised status inside the total", () => {
		const rows = [
			pv("SIGNED", 20),
			pv("SOME_NEW_STATE" as PrPaymentVoucher["status"], 7),
		];
		const b = pvPayoutBuckets(rows);
		expect(b.awaiting).toEqual({ total: 7, count: 1 });
		expect(b.total).toEqual({ total: 27, count: 2 });
		expectPartsSumToWhole(rows);
	});

	it("applies deductions, and never reports a negative", () => {
		const b = pvPayoutBuckets([pv("SIGNED", 100, 30), pv("SIGNED", 10, 40)]);
		// 70 + max(0, 10-40) => 70, not 40.
		expect(b.toPay.total).toBe(70);
	});

	it("adds sen without drift", () => {
		const rows = [pv("SIGNED", 0.1), pv("SIGNED", 0.2)];
		expect(pvPayoutBuckets(rows).toPay.total).toBe(0.3);
		expectPartsSumToWhole(rows);
	});

	/*
	 * An advance is money the PR already has. `getPvRowSubtotal` excludes it
	 * from earnings, and the buckets inherit that — a card that counted it
	 * would tell the agency to pay the same money twice.
	 */
	it("does not count a withdrawal or advance line as payable", () => {
		const b = pvPayoutBuckets([
			pv("SIGNED", 200),
			pv("SIGNED", 80, 0, "Cash advance"),
			pv("SIGNED", 60, 0, "Withdrawal"),
		]);
		expect(b.toPay.total).toBe(200);
		// Still three outstanding vouchers — only their money is excluded.
		expect(b.toPay.count).toBe(3);
	});

	it("reports zeroes, not blanks, for an empty week", () => {
		const b = pvPayoutBuckets([]);
		expect(b.total).toEqual({ total: 0, count: 0 });
		expect(b.toPay).toEqual({ total: 0, count: 0 });
	});
});
