import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";

/**
 * The roster PR a voucher is FOR — found by the voucher's own foreign key.
 *
 * `payment_voucher.pr_id` is the PR's user id, and a real voucher now carries
 * it (`prId`). Screens used to find the PR by COPIES instead — the voucher's
 * `pr_ic` snapshot, then its copied name — and a copy goes stale the moment the
 * person's own row changes. Vicky's IC on her profile was corrected on 8 Sep
 * 2026; eight of her nine vouchers still hold the old one, so every voucher
 * screen matched her by nothing and printed the old IC, while Manage PR and
 * Approvals printed the new one. The copies stay as the fallback for a voucher
 * whose PR is no longer on this roster.
 */
export function rosterPrForVoucher(
	pv: Pick<PrPaymentVoucher, "prId" | "prIc">,
	agencyPRs: readonly AgencyManagedPR[],
): AgencyManagedPR | undefined {
	if (pv.prId) {
		const byId = agencyPRs.find((p) => p.id === pv.prId);
		if (byId) return byId;
	}
	if (pv.prIc) return agencyPRs.find((p) => p.ic === pv.prIc);
	return undefined;
}

/**
 * The IC a voucher screen prints: the PR's own `user_profile.id_no` — the one
 * field Manage PR and Approvals read — and the voucher's snapshot only for a PR
 * this roster no longer holds.
 */
export function voucherPayeeIc(
	pv: Pick<PrPaymentVoucher, "prId" | "prIc">,
	agencyPRs: readonly AgencyManagedPR[],
): string | undefined {
	return rosterPrForVoucher(pv, agencyPRs)?.ic?.trim() || pv.prIc || undefined;
}
