import { sumCollectionRm } from "@agency-portal/lib/collections";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CollectionInvoice,
	fetchCollectionInvoices,
} from "@/services/collection-invoice";

const OUTLET_COLLECTIONS_KEY = ["outlet", "collection-invoices"] as const;

export interface OutletCollectionTotals {
	/** Issued and not settled — what this venue currently owes. */
	owedRm: number;
	/** Issued, past due. A subset of `owedRm`, not an addition to it. */
	overdueRm: number;
	settledRm: number;
}

export interface UseOutletCollectionsResult {
	/** False for demo sessions — the caller falls back to its demo store. */
	backed: boolean;
	/** Newest week first. Drafts are never present; the server strips them. */
	invoices: CollectionInvoice[];
	totals: OutletCollectionTotals;
	/**
	 * True when more than one agency has billed this venue. The row carries an
	 * `agencyId` but no agency NAME, so the UI cannot say who each statement is
	 * from — it must not guess, and it should say so rather than imply one sender.
	 */
	hasMultipleAgencies: boolean;
	isLoading: boolean;
}

/**
 * What this venue has been billed by its agency, one statement per week.
 *
 * Deliberately READ-ONLY, and not because it was quicker: `issue` and `settle`
 * are gated to admin and agency server-side, on the reasoning that an outlet must
 * not be able to mark its own bill settled — it is the one party with an interest
 * in saying it was paid, and this app cannot check. Exposing the buttons here
 * would only produce a 403 and teach the venue to distrust the screen.
 *
 * Drafts are filtered out by the controller, not here: a draft has not been
 * issued to anyone, and showing a figure the agency is still reviewing invites an
 * argument about a number nobody has stood behind yet.
 *
 * No client-side tenant filter — the controller pins an outlet to its own
 * `outletId` and overwrites any id the client sends.
 */
export function useOutletCollections(): UseOutletCollectionsResult {
	const { logout } = useAuth();
	const backed = getOutletIdentity() !== null;

	const query = useQuery({
		queryKey: OUTLET_COLLECTIONS_KEY,
		queryFn: () => fetchCollectionInvoices({}, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const rows = useMemo<CollectionInvoice[]>(
		() => query.data?.data ?? [],
		[query.data],
	);

	const { invoices, totals, hasMultipleAgencies } = useMemo(() => {
		const issued = rows.filter((r) => r.status === "issued");
		const settled = rows.filter((r) => r.status === "settled");
		return {
			invoices: [...issued, ...settled].sort((a, b) =>
				b.weekStart.localeCompare(a.weekStart),
			),
			totals: {
				owedRm: sumCollectionRm(issued),
				overdueRm: sumCollectionRm(issued.filter((r) => r.aging === "overdue")),
				settledRm: sumCollectionRm(settled),
			},
			hasMultipleAgencies: new Set(rows.map((r) => r.agencyId)).size > 1,
		};
	}, [rows]);

	return {
		backed,
		invoices,
		totals,
		hasMultipleAgencies,
		isLoading: query.isLoading,
	};
}
