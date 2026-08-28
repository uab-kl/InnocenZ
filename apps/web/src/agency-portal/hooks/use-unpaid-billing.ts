import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import { fetchSubscriptionInvoiceGroups } from "@/services/subscription-invoice";

export interface UnpaidBillingState {
	/** False on a demo session — nothing here is ever demo data. */
	backed: boolean;
	/** Total still owed to InnocenZ, in ringgit. 0 when nothing is outstanding. */
	total: number;
	/** How many billing periods make that up. */
	periods: number;
	/** Earliest unpaid period start, `YYYY-MM-DD` — the one owed longest. */
	oldestPeriodStart: string | null;
	isLoading: boolean;
}

/**
 * What this organisation still owes InnocenZ for its own subscription.
 *
 * WHY THE GROUPED ENDPOINT AND NOT THE FLAT LIST. The flat list is paginated, so
 * summing it would total whichever ten invoices came back and label the answer
 * "you owe this" — the same fault the admin's Plan Payment cards were rebuilt to
 * avoid. `groupBy=subscriber` pages the ORGS and then fetches each one's
 * invoices WHOLE, re-applying the status filter to both halves. A caller scoped
 * to itself is one org, so the single group it gets back holds every unpaid
 * period and the total is complete by construction.
 *
 * Deliberately NOT the collections hooks beside this one: those read
 * `collection_invoice`, what a venue owes its AGENCY, which is the opposite
 * direction of money and has been switched off since 12 Aug 2026.
 */
export function useUnpaidBilling(
	portal: "outlet" | "agency",
): UnpaidBillingState {
	const identity = useMemo(
		() => (portal === "agency" ? getAgencyIdentity() : getOutletIdentity()),
		[portal],
	);
	const backed = identity !== null;

	const query = useQuery({
		queryKey: ["subscription-invoice", "unpaid", portal],
		queryFn: () =>
			fetchSubscriptionInvoiceGroups(
				{ status: "unpaid", page: 1, pageSize: 1 },
				kickToLogin,
			),
		// One org, so one group — the page size bounds ORGS, never the invoices
		// inside them.
		enabled: backed,
		staleTime: 60_000,
	});

	return useMemo(() => {
		const invoices = query.data?.data?.[0]?.invoices ?? [];
		/**
		 * INTEGER CENTS. `amount` is numeric(12,2) over the wire, so a string;
		 * adding them as floats is how 6,999.00 + 150.10 becomes 7,149.099999 on
		 * a screen whose whole job is to state a debt exactly.
		 */
		const cents = invoices.reduce((sum, invoice) => {
			const parsed = Math.round(Number(invoice.amount) * 100);
			return sum + (Number.isFinite(parsed) ? parsed : 0);
		}, 0);

		// Zero-padded fixed-width days, so a string compare is a date compare.
		const oldest = invoices.reduce<string | null>(
			(earliest, invoice) =>
				earliest === null || invoice.periodStart < earliest
					? invoice.periodStart
					: earliest,
			null,
		);

		return {
			backed,
			total: cents / 100,
			periods: invoices.length,
			oldestPeriodStart: oldest,
			isLoading: query.isLoading,
		};
	}, [backed, query.data, query.isLoading]);
}
