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
	financeSignPaymentVoucher,
	type UpdatePaymentVoucherInput,
	updatePaymentVoucher,
} from "@/services/payment-voucher";

const PV_KEY = ["agency", "payment-vouchers"] as const;

/** Backend ids are uuids; the demo store uses short slugs like "pv1". */
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Does this voucher id have a backend row behind it?
 *
 * Demo vouchers carry ids like "pv1", so asking the API for one is a guaranteed
 * failed request on every open. Exported because every surface reading a real
 * voucher needs the same answer, and a second copy of this test is how one of
 * them ends up firing those requests anyway.
 */
export const isBackedVoucherId = (id: string | null): boolean =>
	Boolean(id && UUID_RE.test(id));

/**
 * The detail fetch behind BOTH the receipt-evidence panel and the day-review
 * panel. Shared so one voucher on screen means one request, and so a decision
 * recorded in one panel refreshes the other.
 */
export const pvEvidenceKey = (id: string | null) =>
	["agency", "payment-voucher", "evidence", id] as const;

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

	/**
	 * The agency's signature. Its own mutation rather than a `patch`, because it
	 * hits its own endpoint — `PUT /:id` rewrites every line, and an attestation
	 * must never be a side effect of an edit. Invalidates the list AND the shared
	 * evidence detail, since signing is what unlocks the send button on both.
	 */
	const financeSignMut = useMutation({
		mutationFn: (vars: {
			id: string;
			signature: { w: number; h: number; strokes: [number, number][][] };
		}) => financeSignPaymentVoucher(vars.id, vars.signature, logout),
		onSuccess: () => {
			invalidate();
			queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher", "evidence"],
			});
		},
	});

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
		// The agency's half of the dual signature — required before sendToPr.
		financeSign: financeSignMut.mutateAsync,
		isSigning: financeSignMut.isPending,
		/**
		 * Records a bank transfer against a SIGNED voucher — the last step of the
		 * rail, and the one that had no action behind it: the payment week said
		 * "use To pay to record each bank transfer" while offering nothing to
		 * record it with.
		 *
		 * The server stamps `paid_at` only when it is not already set, so a second
		 * click cannot re-date a payment that already happened.
		 */
		markPaid: (id: string, bankRef?: string) =>
			patch(id, { status: "paid", ...(bankRef ? { bankRef } : {}) }),
	};
}

/**
 * The raw backend voucher — lines AND receipts — for the verify surface.
 *
 * Separate from useAgencyPvDetail because that one maps into the demo
 * PrPaymentVoucher shape, which has nowhere to put a receipt or a line's
 * component. Verification needs the unmapped rows: what was claimed, and what
 * evidence backs it.
 */
export function useAgencyPvEvidence(id: string | null) {
	const { logout } = useAuth();
	// A demo voucher simply shows no evidence rather than firing a request that
	// cannot succeed.
	const isBacked = isBackedVoucherId(id);
	const query = useQuery({
		queryKey: pvEvidenceKey(id),
		queryFn: () => fetchPaymentVoucher(id as string, logout),
		enabled: isBacked,
		staleTime: 60_000,
	});
	return {
		voucher: query.data ?? null,
		isBacked,
		isLoading: isBacked && query.isLoading,
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
