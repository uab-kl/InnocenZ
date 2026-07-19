import {
	managedPvFromBackend,
	managedPvFromBackendDetail,
	pvLineInputsFromRows,
} from "@agency-portal/lib/payment-voucher-map";
import type { PrPaymentVoucher, PrPvRow } from "@agency-portal/lib/pr-demo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchPaymentVoucher,
	fetchPaymentVouchers,
	type UpdatePaymentVoucherInput,
	updatePaymentVoucher,
} from "@/services/payment-voucher";

const PV_KEY = ["agency", "payment-vouchers"] as const;

/**
 * Backend-driven payment vouchers for the Payroll & PV screen. Reads real PVs
 * (already agency-scoped server-side, so no client tenant filter) and exposes
 * the lifecycle writes the backend supports via PUT /payment-voucher: send to
 * PR, re-send, resolve dispute, override a signed PV, and edit line items on a
 * dispute. Demo-only surfaces — e-signature images, the 4-part earnings
 * breakdown, sales/commission totals, receipt scans — have no backend and stay
 * on the demo store.
 */
export function useAgencyPvs(params: { enabled?: boolean } = {}) {
	const { enabled = true } = params;
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const invalidate = () => queryClient.invalidateQueries({ queryKey: PV_KEY });

	const pvQuery = useQuery({
		queryKey: PV_KEY,
		queryFn: () => fetchPaymentVouchers({ pageSize: 500 }, logout),
		enabled,
		staleTime: 60_000,
	});

	const pvs = useMemo<PrPaymentVoucher[]>(
		() => (pvQuery.data?.data ?? []).map(managedPvFromBackend),
		[pvQuery.data],
	);

	const updateMut = useMutation({
		mutationFn: (vars: { id: string; input: UpdatePaymentVoucherInput }) =>
			updatePaymentVoucher(vars.id, vars.input, logout),
		onSuccess: invalidate,
	});

	const patch = (id: string, input: UpdatePaymentVoucherInput) =>
		updateMut.mutate({ id, input });

	return {
		pvs,
		isLoading: pvQuery.isLoading,
		// Finance raises → PR e-signs; both "send" and "re-send" move to SENT.
		sendToPr: (id: string) => patch(id, { status: "sent" }),
		resend: (id: string) => patch(id, { status: "sent" }),
		// Resolve dispute & reassign — re-issues to the PR for a fresh sign.
		resolveDispute: (id: string) => patch(id, { status: "sent" }),
		// Finance override of a signed/paid PV — re-opens for PR review; the
		// reason is recorded in the dispute note (backend has no override-audit).
		overrideSigned: (id: string, reason: string) =>
			patch(id, { status: "pending_review", disputeNote: reason }),
		// Dispute-resolution line edit: replace lines and the deduction.
		editLines: (id: string, rows: PrPvRow[], deduction: number) =>
			patch(id, { lines: pvLineInputsFromRows(rows), deduction }),
	};
}

/**
 * Fetch a single voucher WITH its line items (the list endpoint omits them).
 * Falls back to the list-mapped voucher until the detail resolves.
 */
export function useAgencyPvDetail(
	id: string | null,
	fallback?: PrPaymentVoucher,
) {
	const { logout } = useAuth();
	const detailQuery = useQuery({
		queryKey: ["agency", "payment-voucher", id],
		queryFn: () => fetchPaymentVoucher(id as string, logout),
		enabled: Boolean(id),
		staleTime: 60_000,
	});

	return useMemo<PrPaymentVoucher | undefined>(
		() =>
			detailQuery.data
				? managedPvFromBackendDetail(detailQuery.data)
				: fallback,
		[detailQuery.data, fallback],
	);
}
