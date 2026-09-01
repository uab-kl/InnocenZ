import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
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
	const queryClient = useQueryClient();

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
		onSuccess: invalidate,
	});

	const markSubmitted = useMutation({
		mutationFn: (id: string) => markPayoutBatchSubmitted(id, logout),
		onSuccess: invalidate,
	});

	const importResponse = useMutation({
		mutationFn: (input: { id: string; csv: string }) =>
			importPayoutResponse(input.id, input.csv, logout),
		onSuccess: invalidate,
	});

	const settle = useMutation({
		mutationFn: (input: { id: string; settlements: PayoutSettlementInput[] }) =>
			settlePayoutBatch(input.id, input.settlements, logout),
		onSuccess: invalidate,
	});

	/**
	 * ⚠️ Invalidates on success because the download MUTATES — the server moves
	 * the run to `exported` and its lines to `sent`. Without this the screen
	 * still shows a draft that looks like it can be exported again.
	 */
	const exportCsv = useMutation({
		mutationFn: (batch: Pick<PayoutBatch, "id" | "reference" | "weekStart">) =>
			downloadPayoutCsv(batch, logout),
		onSuccess: invalidate,
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
