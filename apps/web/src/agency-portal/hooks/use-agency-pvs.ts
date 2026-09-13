import {
	managedPvFromBackend,
	managedPvFromBackendDetail,
	pvLineInputsFromRows,
} from "@agency-portal/lib/payment-voucher-map";
import type { PrPaymentVoucher, PrPvRow } from "@agency-portal/lib/pr-demo";
import { useStore } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	fetchPaymentVoucher,
	fetchPaymentVouchers,
	fetchVoucherPayeeBank,
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
 * The agency's vouchers, RAW and paged to exhaustion — the one query behind
 * `PV_KEY`, and the only place this list is fetched.
 *
 * Exported because the Subscription screen needs the same rows to count what
 * this agency issued in a payroll week, and it used to fetch them itself under
 * `["agency","subscription","weekly-pv"]`. That was the same GET twice, under
 * two keys that nothing invalidated in common: raising a voucher on Payroll left
 * the count the subscription TIER is priced from unchanged for a minute, and the
 * auto-tier plan-change write fired off whichever copy happened to be colder.
 *
 * ⚠️ `pageSize: 500` is what this used to ask for, and the server clamps every
 * list to 100 and returns the short page with no error (see
 * `lib/fetch-all-pages.ts`). So past 100 vouchers the Payroll totals, the Today
 * hub's Pending payout and the subscription's billed tier were all computed over
 * the OLDEST hundred. Page it out; never raise the number.
 */
export function useAgencyPvRows(params: { enabled?: boolean } = {}) {
	const { enabled = true } = params;
	const { logout } = useAuth();
	return useQuery({
		queryKey: PV_KEY,
		queryFn: () =>
			fetchAllPages((page) =>
				fetchPaymentVouchers({ page, pageSize: 100 }, logout),
			),
		enabled,
		staleTime: 60_000,
	});
}

/**
 * Where this PR is paid — UNMASKED, and ONLY for the printed voucher.
 *
 * Kept out of `useAgencyPvs` so it is never fetched incidentally: the endpoint
 * is gated to owner/finance and returns a full bank account number, so it
 * should be asked for by the one surface that needs it and no other.
 *
 * `isBackedVoucherId` guards it — a demo voucher id like "pv1" would be a
 * guaranteed failed request on every open.
 */
export function useVoucherPayeeBank(voucherId: string | null) {
	const { logout } = useAuth();
	return useQuery({
		queryKey: ["agency", "payment-voucher", "payee-bank", voucherId],
		queryFn: () => fetchVoucherPayeeBank(voucherId as string, logout),
		enabled: isBackedVoucherId(voucherId),
	});
}

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
	const { t } = usePortalLocale();
	// The portal-wide toaster, same one the roster mutations write to.
	const { toast } = useStore();
	const queryClient = useQueryClient();
	const invalidate = () => queryClient.invalidateQueries({ queryKey: PV_KEY });

	const pvQuery = useAgencyPvRows({ enabled });

	const pvs = useMemo<PrPaymentVoucher[]>(
		() => (pvQuery.data?.data ?? []).map(managedPvFromBackend),
		[pvQuery.data],
	);

	// Raw `updatedAt` per voucher, exactly as fetched — the optimistic-
	// concurrency token editLines sends. This list sits behind a 60s staleTime
	// while the PR's phone can append lines to the same current-week draft; a
	// save from this stale editor used to silently destroy that line and its
	// proof photo. With the token, the backend 409s and the operator reloads.
	const rawUpdatedAt = useMemo(
		() => new Map((pvQuery.data?.data ?? []).map((v) => [v.id, v.updatedAt])),
		[pvQuery.data],
	);

	const updateMut = useMutation({
		mutationFn: (vars: { id: string; input: UpdatePaymentVoucherInput }) =>
			updatePaymentVoucher(vars.id, vars.input, logout),
		onSuccess: invalidate,
		/*
		 * EVERY REFUSAL ON THIS ENDPOINT WAS SILENT UNTIL 3 SEP 2026.
		 *
		 * `patch()` is `mutate`, not `mutateAsync`, so a rejected promise had
		 * nowhere to go: React Query has no default error UI and this app
		 * installs no MutationCache handler. Send, re-send, resolve-dispute,
		 * override, mark-paid and the dispute line edit all ride this one
		 * mutation — six actions that answered a 409 by doing nothing visible at
		 * all. On PV-000009 that read as a dead button: the server was refusing
		 * with a sentence naming both undecided overtime claims, and the screen
		 * dropped it.
		 *
		 * The server's own message is what gets shown, never a generic one. These
		 * refusals are written to be read by the person who hit them — they name
		 * the dates, the receipts, the day to come back on — and replacing that
		 * with "something went wrong" would throw away the only part that tells
		 * the agency what to do next. The fallback is for the case where there is
		 * no message: a network drop, a 502, a proxy.
		 *
		 * `warn`, not `error`: a gate refusing an early send is the system
		 * working. It is the same tone the roster's travel-gap warning uses.
		 */
		onError: (error) => {
			const failure = toMutationError(error, t.agencyPv.voucherUpdateRefused);
			toast(failure?.message ?? t.agencyPv.voucherUpdateRefused, "warn");
		},
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
		/*
		 * ⚠️ A FAILED FETCH IS NOT AN EMPTY PAYROLL WEEK.
		 *
		 * `pvs` is `[]` in both cases, and Payroll & PV renders that as its
		 * "no vouchers" empty state — so an agency whose request failed was told,
		 * in a settled voice, that nobody is owed anything this week. That is the
		 * most expensive thing this screen can say wrongly.
		 *
		 * Exposed so the page can tell the two apart. `use-agency-outlets` has
		 * always done this; the rest of the portal is catching up to it.
		 */
		isError: pvQuery.isError,
		// Finance raises → PR e-signs; both "send" and "re-send" move to SENT.
		sendToPr: (id: string) => patch(id, { status: "sent" }),
		resend: (id: string) => patch(id, { status: "sent" }),
		// Resolve dispute & reassign — re-issues to the PR for a fresh sign.
		resolveDispute: (id: string) => patch(id, { status: "sent" }),
		// Finance override of a signed/paid PV — re-opens for PR review; the
		// reason is recorded in the dispute note (backend has no override-audit).
		overrideSigned: (id: string, reason: string) =>
			patch(id, { status: "pending_review", disputeNote: reason }),
		// Dispute-resolution line edit: replace lines and the deduction. Carries
		// the concurrency token — this is the one patch that REPLACES the line
		// set, so it is the one that must refuse when the voucher moved.
		editLines: (id: string, rows: PrPvRow[], deduction: number) =>
			patch(id, {
				lines: pvLineInputsFromRows(rows),
				deduction,
				expectedUpdatedAt: rawUpdatedAt.get(id),
			}),
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
 *
 * ⚠️ SHARES `useAgencyPvEvidence`'s query — same endpoint, same key, one request.
 *
 * It used to hold its own `["agency","payment-voucher", id]`, which is NOT a
 * prefix of `["agency","payment-voucher","evidence", id]` and was therefore
 * missed by every invalidation the receipt and day-review writes fire. Both are
 * on the Payroll detail at once: the voucher document rendered from this hook
 * kept quoting pre-edit money while the evidence panel beside it, reading the
 * same voucher, had already refreshed. One key, and the whole class goes away.
 *
 * Gating on `isBackedVoucherId` rather than `Boolean(id)` also stops the doomed
 * request a demo id like "pv1" used to fire on every open; the caller still gets
 * `fallback`, exactly as it did when that request failed.
 */
export function useAgencyPvDetail(
	id: string | null,
	fallback?: PrPaymentVoucher,
) {
	const { voucher } = useAgencyPvEvidence(id);

	return useMemo<PrPaymentVoucher | undefined>(
		() => (voucher ? managedPvFromBackendDetail(voucher) : fallback),
		[voucher, fallback],
	);
}
