import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { sumCollectionRm } from "@agency-portal/lib/collections";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CollectionInvoice,
	type CollectionInvoiceApiResponse,
	fetchCollectionInvoices,
	issueCollectionInvoice,
	settleCollectionInvoice,
} from "@/services/collection-invoice";

const COLLECTIONS_KEY = ["agency", "collection-invoices"] as const;

export interface AgencyCollectionTotals {
	/** Drafted by the weekly job, not yet shown to any outlet. */
	draftRm: number;
	/** Issued and not settled — the actual receivable. */
	outstandingRm: number;
	/** Issued, past due. A subset of `outstandingRm`, not an addition to it. */
	overdueRm: number;
	settledRm: number;
}

export interface UseAgencyCollectionsResult {
	/** False for demo sessions — the caller falls back to its demo store. */
	backed: boolean;
	invoices: CollectionInvoice[];
	drafts: CollectionInvoice[];
	/** Issued or settled: everything an outlet has actually been shown. */
	issued: CollectionInvoice[];
	totals: AgencyCollectionTotals;
	isLoading: boolean;
	/**
	 * Both resolve with the server's own response. The caller shows
	 * `message` rather than composing its own: `settle` is worded to say it
	 * records a claim and does not verify payment, and a client-side string
	 * would quietly overstate what happened.
	 */
	issue: (id: string) => Promise<CollectionInvoiceApiResponse>;
	settle: (id: string) => Promise<CollectionInvoiceApiResponse>;
	isMutating: boolean;
}

/**
 * This agency's receivables from its outlets — one row per outlet per week,
 * drafted by the Monday payout job from completed shift assignments.
 *
 * The backend for this shipped with the table, the routes and the weekly
 * producer, and no frontend at all, so nothing rendered it on either portal.
 *
 * It is NOT the same money as the Subscription screen's billing history, which
 * is what this agency owes InnocenZ. Opposite direction, different table — the
 * two are deliberately kept as separate sections rather than one list.
 *
 * No client-side tenant filter: the controller resolves the caller's agency
 * server-side and overwrites any id the client sends.
 */
export function useAgencyCollections(): UseAgencyCollectionsResult {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const backed = getAgencyIdentity() !== null;

	const query = useQuery({
		queryKey: COLLECTIONS_KEY,
		queryFn: () => fetchCollectionInvoices({}, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const invoices = useMemo<CollectionInvoice[]>(
		() => query.data?.data ?? [],
		[query.data],
	);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });

	const issueMut = useMutation({
		mutationFn: (id: string) => issueCollectionInvoice(id, logout),
		onSuccess: invalidate,
	});

	const settleMut = useMutation({
		mutationFn: (id: string) => settleCollectionInvoice(id, logout),
		onSuccess: invalidate,
	});

	const { drafts, issued, totals } = useMemo(() => {
		const draftRows = invoices.filter((i) => i.status === "draft");
		const issuedRows = invoices.filter((i) => i.status === "issued");
		const settledRows = invoices.filter((i) => i.status === "settled");
		return {
			drafts: draftRows,
			// Everything the outlet has been shown, newest week first.
			issued: [...issuedRows, ...settledRows].sort((a, b) =>
				b.weekStart.localeCompare(a.weekStart),
			),
			totals: {
				draftRm: sumCollectionRm(draftRows),
				outstandingRm: sumCollectionRm(issuedRows),
				overdueRm: sumCollectionRm(
					issuedRows.filter((i) => i.aging === "overdue"),
				),
				settledRm: sumCollectionRm(settledRows),
			},
		};
	}, [invoices]);

	return {
		backed,
		invoices,
		drafts,
		issued,
		totals,
		isLoading: query.isLoading,
		issue: issueMut.mutateAsync,
		settle: settleMut.mutateAsync,
		isMutating: issueMut.isPending || settleMut.isPending,
	};
}
