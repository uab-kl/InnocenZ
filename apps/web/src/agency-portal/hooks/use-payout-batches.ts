import { serverMessage } from "@agency-portal/hooks/use-org-members";
import { useStore } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	cancelPayoutBatch,
	createPayoutBatch,
	downloadPayoutCsv,
	fetchPayoutBatch,
	fetchPayoutBatches,
	fetchPayoutCandidates,
	importPayoutResponse,
	markPayoutBatchSubmitted,
	type PayoutBatch,
	type PayoutMethod,
	type PayoutSettlementInput,
	settlePayoutBatch,
} from "@/services/payout-batch";

const BATCHES_KEY = ["agency", "payout-batches"] as const;
const candidatesKey = (weekStart: string) =>
	["agency", "payout-candidates", weekStart] as const;
const batchKey = (id: string | null) => ["agency", "payout-batch", id] as const;

/**
 * The agency's payout runs.
 *
 * Every mutation invalidates BOTH the run list and the candidate list, because
 * they are two views of one fact: taking a voucher into a run removes it from
 * the candidates, and cancelling a run puts it back. Refreshing only the list
 * you happen to be looking at is how a cancelled run's vouchers stay invisible
 * until a page reload.
 */
export function usePayoutBatches(params: {
	weekStart?: string;
	weekEnd?: string;
	enabled?: boolean;
}) {
	const { weekStart, weekEnd, enabled = true } = params;
	const { logout } = useAuth();
	const { t } = usePortalLocale();
	// The portal-wide toaster — the same one the roster mutations write to.
	const { toast } = useStore();
	const queryClient = useQueryClient();

	/*
	 * ⚠️ FOUR OF THESE WRITES USED TO SAY NOTHING AT ALL.
	 *
	 * Cancel, Mark-as-submitted, Settle and Export each carried
	 * `onSuccess: invalidate` and no `onError`, so the list refetched and looked
	 * unchanged — which is precisely what a SUCCESSFUL no-op looks like. On this
	 * screen the second click is not harmless: cancelling a run twice is noise,
	 * but pressing Export again RE-SENDS a bank file, and pressing Settle again
	 * re-reports lines to a run that may already be closed.
	 *
	 * The SERVER's sentence, not a generic one — these endpoints answer with the
	 * counts (vouchers released, lines settled, vouchers marked paid) that are
	 * the only on-screen evidence of how much of the write actually landed.
	 */
	const failed = (fallback: string) => (error: unknown) =>
		toast(serverMessage(error, fallback), "warn");
	const succeeded = (fallback: string) => (result: { message: string }) => {
		invalidate();
		toast(result.message || fallback, "success");
	};

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: BATCHES_KEY });
		queryClient.invalidateQueries({
			queryKey: ["agency", "payout-candidates"],
		});
		queryClient.invalidateQueries({ queryKey: ["agency", "payout-batch"] });
		// A settled run marks vouchers paid, so the PV list is stale too.
		queryClient.invalidateQueries({ queryKey: ["agency", "payment-vouchers"] });
	};

	const batchesQuery = useQuery({
		queryKey: BATCHES_KEY,
		queryFn: () => fetchPayoutBatches(logout),
		enabled,
	});

	const candidatesQuery = useQuery({
		queryKey: candidatesKey(weekStart ?? ""),
		queryFn: () =>
			fetchPayoutCandidates(weekStart as string, weekEnd as string, logout),
		// Both halves or nothing — a candidates call with half a week 400s.
		enabled: enabled && Boolean(weekStart && weekEnd),
	});

	const create = useMutation({
		mutationFn: (input: {
			weekStart: string;
			weekEnd: string;
			method?: PayoutMethod;
			voucherIds?: string[];
		}) => createPayoutBatch(input, logout),
		onSuccess: invalidate,
	});

	const cancel = useMutation({
		mutationFn: (id: string) => cancelPayoutBatch(id, logout),
		onSuccess: succeeded(t.payouts.runCancelled),
		onError: failed(t.payouts.couldNotCancelRun),
	});

	const markSubmitted = useMutation({
		mutationFn: (id: string) => markPayoutBatchSubmitted(id, logout),
		onSuccess: succeeded(t.payouts.runSubmitted),
		onError: failed(t.payouts.couldNotMarkSubmitted),
	});

	/*
	 * The only one that already spoke on failure — the sheet renders the 409's
	 * list of unmatched lines inline, which is more useful than a toast and is
	 * kept. What it never did was confirm a SUCCESSFUL import, and "Imported 3
	 * line(s)" over a 59-line file is exactly the case a human must catch.
	 */
	const importResponse = useMutation({
		mutationFn: (input: { id: string; csv: string }) =>
			importPayoutResponse(input.id, input.csv, logout),
		onSuccess: succeeded(t.payouts.responseImported),
	});

	const settle = useMutation({
		mutationFn: (input: { id: string; settlements: PayoutSettlementInput[] }) =>
			settlePayoutBatch(input.id, input.settlements, logout),
		onSuccess: succeeded(t.payouts.settlementRecorded),
		onError: failed(t.payouts.couldNotSettle),
	});

	/**
	 * ⚠️ Invalidates on success because the download MUTATES — the server moves
	 * the run to `exported` and its lines to `sent`. Without this the screen
	 * still shows a draft that looks like it can be exported again.
	 */
	const exportCsv = useMutation({
		mutationFn: (batch: Pick<PayoutBatch, "id" | "runNo" | "weekStart">) =>
			downloadPayoutCsv(batch, logout),
		// A blob, so there is no server sentence to echo — but this is the write
		// where silence is most expensive, because the button stays pressable and
		// pressing it again hands the bank a second copy of the same run.
		onSuccess: () => {
			invalidate();
			toast(t.payouts.fileDownloaded, "success");
		},
		onError: failed(t.payouts.couldNotDownloadFile),
	});

	return {
		batches: batchesQuery.data ?? [],
		batchesLoading: batchesQuery.isLoading,
		candidates: candidatesQuery.data,
		candidatesLoading: candidatesQuery.isLoading,
		create,
		cancel,
		markSubmitted,
		settle,
		importResponse,
		exportCsv,
	};
}

/** One run with its lines — the detail sheet. */
export function usePayoutBatch(id: string | null) {
	const { logout } = useAuth();
	return useQuery({
		queryKey: batchKey(id),
		queryFn: () => fetchPayoutBatch(id as string, logout),
		enabled: Boolean(id),
	});
}
