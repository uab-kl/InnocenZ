import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
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

/**
 * Summed in integer cents rather than by adding the floats.
 *
 * `amount` arrives as the string `numeric(12,2)` serializes to, so the choice is
 * deliberate: this is the same arithmetic the voucher Σ=0 check exists to catch
 * on the other side of the money loop, and a receivables total is read as a
 * figure to chase someone for.
 */
function sumRm(invoices: CollectionInvoice[]): number {
	const cents = invoices.reduce((total, invoice) => {
		const parsed = Math.round(Number(invoice.amount) * 100);
		return total + (Number.isFinite(parsed) ? parsed : 0);
	}, 0);
	return cents / 100;
}

/** `numeric` is a string over the wire; every display path needs a number. */
export function collectionAmountRm(invoice: CollectionInvoice): number {
	const parsed = Number(invoice.amount);
	return Number.isFinite(parsed) ? parsed : 0;
}

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
				draftRm: sumRm(draftRows),
				outstandingRm: sumRm(issuedRows),
				overdueRm: sumRm(issuedRows.filter((i) => i.aging === "overdue")),
				settledRm: sumRm(settledRows),
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
