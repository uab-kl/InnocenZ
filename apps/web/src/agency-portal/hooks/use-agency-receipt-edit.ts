import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
	type AgencyAddedLineKind,
	addPaymentVoucherReceiptLine,
	editPaymentVoucherReceipt,
	editPaymentVoucherReceiptLine,
} from "@/services/payment-voucher";
import { agencyReceiptsKey } from "./use-agency-receipts";
import { writeFailureMessage } from "./write-failure-message";

/**
 * The three writes behind the agency's receipt EDITOR: correct a line's quantity
 * or commission, add a drinks/tips line the log missed, and correct the
 * receipt's own order number or date.
 *
 * One hook rather than one per panel, because the two screens that show a
 * receipt must invalidate the SAME three caches after a write. They are not
 * interchangeable: the feed holds the receipt rows, the evidence detail holds
 * the day reviews and `allDaysReviewed` that decide whether the voucher may be
 * sent, and the voucher list holds the net. Refreshing only the panel you are
 * standing in leaves the other two quoting money that no longer exists.
 *
 * Every write here is targeted by id. None of them goes through
 * `PUT /payment-voucher/:id`, which replaces a voucher's whole line set and once
 * severed the receipt links and deleted the PR's proof photos.
 */
export function useAgencyReceiptEdit() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	/**
	 * RETURNS the promises, so `mutateAsync` resolves only once the refetches
	 * have landed. Fired-and-forgotten, react-query v5 resolves the mutation
	 * first — and the editor clears its draft on that resolution, falling back to
	 * props that are still the pre-edit row. The saved figure visibly reverted
	 * for the length of the round trip, which reads as a save that did not take.
	 */
	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: agencyReceiptsKey }),
			// ⚠️ TWO payment-voucher keys, and neither is a prefix of the other:
			// `useAgencyPvDetail` reads ["agency","payment-voucher", id] while the
			// evidence read is ["agency","payment-voucher","evidence", id]. Both are
			// on screen together, so refreshing only the evidence left the voucher
			// document beside it quoting the pre-edit figures.
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher", "evidence"],
			}),
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher"],
			}),
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-vouchers"],
			}),
		]);

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

	const addLineMut = useMutation({
		mutationFn: (vars: {
			receiptId: string;
			kind: AgencyAddedLineKind;
			description: string;
			quantity: number;
			amount: number;
		}) =>
			addPaymentVoucherReceiptLine(
				vars.receiptId,
				{
					kind: vars.kind,
					description: vars.description,
					quantity: vars.quantity,
					amount: vars.amount,
				},
				logout,
			),
		onSuccess: invalidate,
	});

	const editReceiptMut = useMutation({
		mutationFn: (vars: {
			receiptId: string;
			orderNo?: string | null;
			receiptDate?: string;
			/** Printed clock time — OCR gets it wrong; null clears it. */
			receiptTime?: string | null;
		}) =>
			editPaymentVoucherReceipt(
				vars.receiptId,
				{
					...(vars.orderNo !== undefined ? { orderNo: vars.orderNo } : {}),
					...(vars.receiptDate !== undefined
						? { receiptDate: vars.receiptDate }
						: {}),
					...(vars.receiptTime !== undefined
						? { receiptTime: vars.receiptTime }
						: {}),
				},
				logout,
			),
		onSuccess: invalidate,
	});

	// Shared with the receipt-review hook. A write that never reached the server
	// used to produce NO message at all, which the reviewer reads as "it saved".
	const message = writeFailureMessage;

	return {
		editLine: editLineMut.mutateAsync,
		addLine: addLineMut.mutateAsync,
		editReceipt: editReceiptMut.mutateAsync,
		/**
		 * Clears all three refusals. A mutation resets only its OWN error, so
		 * without this a rejected line correction would still be printed in red
		 * under a date change that the server accepted a moment later.
		 */
		resetError: () => {
			editLineMut.reset();
			addLineMut.reset();
			editReceiptMut.reset();
		},
		isSaving:
			editLineMut.isPending || addLineMut.isPending || editReceiptMut.isPending,
		/**
		 * The server's refusal, verbatim. Each one is a rule the reviewer has to
		 * read rather than a failure to retry: a verified receipt belongs to a
		 * closed week, a PR-signed voucher may not be re-priced behind the
		 * signature, a date outside the voucher's own week would move money into a
		 * week this voucher does not pay, and a duplicated order number is the
		 * double payment the one-paper-one-log rule exists to stop.
		 */
		error:
			message(editLineMut.error) ??
			message(addLineMut.error) ??
			message(editReceiptMut.error),
	};
}
