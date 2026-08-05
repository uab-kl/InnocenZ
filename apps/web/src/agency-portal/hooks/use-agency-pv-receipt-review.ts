import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type PaymentVoucherReceipt,
	reviewPaymentVoucherReceipt,
} from "@/services/payment-voucher";
import { pvEvidenceKey, useAgencyPvEvidence } from "./use-agency-pvs";
import { agencyReceiptsKey } from "./use-agency-receipts";
import { writeFailureMessage } from "./write-failure-message";

/**
 * The agency's receipt-by-receipt review of one voucher.
 *
 * Rides on the SAME detail fetch as the day-review and evidence panels — one
 * voucher on screen is one request — and invalidates that shared key after every
 * write, because a receipt approval changes what the send gate says. Refreshing
 * only this panel would leave the send button and the day rows describing the
 * voucher as it was a moment ago.
 *
 * The APPROVAL only. Correcting the figures on a receipt lives in
 * `useAgencyReceiptEdit`, which the shared editor uses from both panels — a
 * correction has to refresh the cross-voucher feed as well, and a second copy of
 * the write here is how the two screens would start disagreeing about the money.
 */
export function useAgencyPvReceiptReview(voucherId: string | null) {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const { voucher, isBacked, isLoading } = useAgencyPvEvidence(voucherId);

	/**
	 * Every read a receipt's status appears in — not only the panel this hook is
	 * standing in.
	 *
	 * Refreshing just `pvEvidenceKey` left the cross-voucher Receipts feed (60s
	 * staleTime) and the voucher list quoting the old status, so approving here
	 * and switching sub-tabs showed the same receipt still Waiting on you. Same
	 * set as `useAgencyReceiptEdit` — one write, one idea of what it touched.
	 *
	 * The promises are RETURNED so `mutateAsync` resolves only once the refetches
	 * land; otherwise a panel that closes on success closes over data that has
	 * not arrived yet.
	 */
	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: pvEvidenceKey(voucherId) }),
			queryClient.invalidateQueries({ queryKey: agencyReceiptsKey }),
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher"],
			}),
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-vouchers"],
			}),
		]);

	const reviewMut = useMutation({
		mutationFn: (vars: { receiptId: string; status: "pending" | "approved" }) =>
			reviewPaymentVoucherReceipt(vars.receiptId, vars.status, logout),
		onSuccess: invalidate,
	});

	const receipts = useMemo<PaymentVoucherReceipt[]>(
		() => voucher?.receipts ?? [],
		[voucher],
	);

	const errorMessage = writeFailureMessage;

	return {
		receipts,
		lines: voucher?.lines ?? [],
		/** False for demo vouchers, which have no receipts to review. */
		isBacked,
		isLoading,
		pendingCount: receipts.filter((r) => r.status === "pending").length,
		reviewReceipt: reviewMut.mutateAsync,
		isSaving: reviewMut.isPending,
		/**
		 * The server's refusal, verbatim. Surfaced rather than swallowed because
		 * each one is a real rule the agency needs to read — a verified receipt
		 * cannot be reopened, and a signed voucher cannot be reviewed at all.
		 */
		error: errorMessage(reviewMut.error),
	};
}
