import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
	type AgencyReceipt,
	approveAllPaymentVoucherReceipts,
	fetchAgencyReceipts,
	reviewPaymentVoucherReceipt,
} from "@/services/payment-voucher";

/**
 * Exported because the DAY review now moves receipts too — approving a day
 * approves the receipts on it, so the panel listing them has to be refetched by
 * a hook that never touches this file otherwise. A second literal copy of the
 * key over there would go stale the day this one is renamed.
 */
export const agencyReceiptsKey = ["agency", "pv-receipts"] as const;
const RECEIPTS_KEY = agencyReceiptsKey;

/**
 * Every receipt logged against this agency's vouchers — the feed behind the
 * Payroll screen's Receipts sub-tab.
 *
 * Deliberately unbounded by date. The endpoint's date filter bounds LOGGED-AT,
 * while the screen's week tabs mean the voucher's payroll week, and a receipt
 * logged on Monday for last week's voucher belongs to the week it was earned in.
 * Passing the tab's dates here would silently drop exactly those rows, so the
 * week filter is applied by the caller against `weekStart`.
 *
 * The review write is the same endpoint the per-voucher verify panel uses, so
 * approving here and approving there are one action under one server rule. Both
 * the voucher list and the shared evidence detail are invalidated after it: an
 * approval changes what the send gate says about that voucher.
 */
export function useAgencyReceipts() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: RECEIPTS_KEY,
		queryFn: () => fetchAgencyReceipts(logout),
		staleTime: 60_000,
	});

	const reviewMut = useMutation({
		mutationFn: (vars: { receiptId: string; status: "pending" | "approved" }) =>
			reviewPaymentVoucherReceipt(vars.receiptId, vars.status, logout),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
			// Prefix match — every open voucher's evidence detail, whichever id it is.
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher", "evidence"],
			});
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-vouchers"],
			});
		},
	});

	// The week-level bulk approve — same invalidations as the single review,
	// because it IS that review, in bulk.
	const approveAllMut = useMutation({
		mutationFn: (weekStart: string) =>
			approveAllPaymentVoucherReceipts(weekStart, logout),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher", "evidence"],
			});
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-vouchers"],
			});
		},
	});

	return {
		receipts: (query.data ?? []) as AgencyReceipt[],
		isLoading: query.isLoading,
		error: query.error,
		reviewReceipt: reviewMut.mutateAsync,
		isReviewing: reviewMut.isPending,
		approveAllWeek: approveAllMut.mutateAsync,
		isApprovingAll: approveAllMut.isPending,
		/**
		 * The server's refusal, verbatim — a verified receipt cannot be reopened and
		 * a signed voucher cannot be reviewed at all. Both are rules the reviewer
		 * needs to read rather than a generic failure.
		 */
		reviewError:
			(
				reviewMut.error as {
					response?: { data?: { message?: string } };
				} | null
			)?.response?.data?.message ?? null,
	};
}
