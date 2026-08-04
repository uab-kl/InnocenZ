import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchPaymentVoucherReceiptCatalogue } from "@/services/payment-voucher";

/**
 * What the OUTLET on one receipt actually sells — the list an added line has to
 * be picked from.
 *
 * Owner's rule (4 Aug 2026): the agency may only add an item the outlet verified
 * it sells, "so in this way can make list the drink on that shift from what
 * outlet". The server enforces it on the write; this read is what lets the form
 * offer the right names instead of letting the reviewer type one that is
 * guaranteed to be refused.
 *
 * `enabled` is the ADD FORM being open, not the editor. Adding a line is the
 * exception — the OCR usually reads the paper correctly — so an editor opened
 * to fix a quantity fetches nothing.
 *
 * No mutation and no cache invalidation of its own: an outlet's price list is
 * changed in the Outlet portal, not here, so it is simply stale-cached for a
 * few minutes.
 */
export function useReceiptCatalogue(receiptId: string, enabled: boolean) {
	const { logout } = useAuth();

	const query = useQuery({
		queryKey: ["agency", "pv-receipt-catalogue", receiptId],
		queryFn: () => fetchPaymentVoucherReceiptCatalogue(receiptId, logout),
		enabled,
		staleTime: 5 * 60_000,
		/**
		 * Do not retry a refusal. This endpoint answers 404 for a receipt that is
		 * unknown or another agency's, and react-query's default of three tries
		 * with backoff turns that instant, permanent answer into several seconds of
		 * spinner before the form admits it has nothing to offer. A 4xx is the
		 * server's decision, not a hiccup; only a transport failure is worth a
		 * second attempt.
		 */
		retry: (failureCount: number, error: unknown) => {
			const status = (error as { response?: { status?: number } } | null)
				?.response?.status;
			if (status && status >= 400 && status < 500) return false;
			return failureCount < 2;
		},
	});

	return {
		items: query.data?.items ?? [],
		outlet: query.data?.outlet ?? null,
		/** Null while the receipt has no resolvable outlet — the caller says so. */
		outletId: query.data?.outletId ?? null,
		/**
		 * WHY there may be nothing to offer, in the server's own words where it has
		 * them: a receipt with no shift link, or an outlet that never configured a
		 * list. A read that never reached the server gets its own sentence rather
		 * than an empty picker with no explanation, because a silent empty list
		 * reads as "this outlet sells nothing".
		 */
		message: query.error
			? "The outlet's list could not be loaded, so nothing can be verified against it yet — try again."
			: (query.data?.message ?? null),
		/**
		 * False while `enabled` is false (react-query v5 leaves a disabled query
		 * pending but not fetching), so the caller only ever sees this once the
		 * form is actually open and waiting.
		 */
		isLoading: query.isLoading,
	};
}
