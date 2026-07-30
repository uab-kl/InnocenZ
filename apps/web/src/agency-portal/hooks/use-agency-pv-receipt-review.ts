import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	editPaymentVoucherReceiptLine,
	type PaymentVoucherReceipt,
	reviewPaymentVoucherReceipt,
} from "@/services/payment-voucher";
import { pvEvidenceKey, useAgencyPvEvidence } from "./use-agency-pvs";

/**
 * The agency's receipt-by-receipt review of one voucher.
 *
 * Rides on the SAME detail fetch as the day-review and evidence panels — one
 * voucher on screen is one request — and invalidates that shared key after every
 * write, because a receipt approval changes what the send gate says and a line
 * correction changes a day's total. Refreshing only this panel would leave the
 * send button and the day rows describing the voucher as it was a moment ago.
 */
export function useAgencyPvReceiptReview(voucherId: string | null) {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const { voucher, isBacked, isLoading } = useAgencyPvEvidence(voucherId);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: pvEvidenceKey(voucherId) });

	const reviewMut = useMutation({
		mutationFn: (vars: { receiptId: string; status: "pending" | "approved" }) =>
			reviewPaymentVoucherReceipt(vars.receiptId, vars.status, logout),
		onSuccess: invalidate,
	});

	const editLineMut = useMutation({
		mutationFn: (vars: {
			receiptId: string;
			lineId: string;
			quantity?: number;
			amount?: number;
		}) =>
			editPaymentVoucherReceiptLine(
				vars.receiptId,
				vars.lineId,
				{ quantity: vars.quantity, amount: vars.amount },
				logout,
			),
		onSuccess: invalidate,
	});

	const receipts = useMemo<PaymentVoucherReceipt[]>(
		() => voucher?.receipts ?? [],
		[voucher],
	);

	const errorMessage = (error: unknown): string | null =>
		(error as { response?: { data?: { message?: string } } } | null)?.response
			?.data?.message ?? null;

	return {
		receipts,
		lines: voucher?.lines ?? [],
		/** False for demo vouchers, which have no receipts to review. */
		isBacked,
		isLoading,
		pendingCount: receipts.filter((r) => r.status === "pending").length,
		reviewReceipt: reviewMut.mutateAsync,
		editLine: editLineMut.mutateAsync,
		isSaving: reviewMut.isPending || editLineMut.isPending,
		/**
		 * The server's refusal, verbatim. Surfaced rather than swallowed because
		 * each one is a real rule the agency needs to read — a verified receipt
		 * cannot be reopened, and a signed voucher cannot be reviewed at all.
		 */
		error: errorMessage(reviewMut.error) ?? errorMessage(editLineMut.error),
	};
}
