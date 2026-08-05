import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	approveAllPaymentVoucherDays,
	type PaymentVoucherDayReview,
	type PaymentVoucherDayStatus,
	type PaymentVoucherReceiptStatus,
	reviewPaymentVoucherDay,
} from "@/services/payment-voucher";
import { pvEvidenceKey, useAgencyPvEvidence } from "./use-agency-pvs";
import { agencyReceiptsKey } from "./use-agency-receipts";

/**
 * Why this voucher may not go to the PR yet — the client-side mirror of the
 * backend's `voucherSendGate()`.
 *
 * `heldDays` and `unreviewedDays` are kept apart because they are different
 * situations: a held day is a decision somebody made, an unreviewed day is one
 * nobody has looked at. Collapsing them into one count would tell the agency a
 * refusal and an omission are the same problem.
 */
export interface PvSendGate {
	allowed: boolean;
	heldDays: string[];
	unreviewedDays: string[];
	/** Receipt numbers still waiting on review — they block the send too. */
	pendingReceipts: string[];
	/** Null when allowed. */
	reason: string | null;
}

const ALLOWED: PvSendGate = {
	allowed: true,
	heldDays: [],
	unreviewedDays: [],
	pendingReceipts: [],
	reason: null,
};

/**
 * Mirror of the server's send gate, deliberately derived from each day's
 * `status` rather than from the response's `hasHeldDay` flag: the two write
 * endpoints return `dayReviews` and `allDaysReviewed` but NOT `hasHeldDay`, so a
 * gate reading that flag would go blank straight after a hold was recorded —
 * exactly when it matters most.
 *
 * Reading `allDaysReviewed` instead would be worse: it is true when every day is
 * decided AND one of them is held, because a held day IS a decision.
 *
 * A voucher with no dated days passes, matching the server: week-level lines (a
 * deduction, an adjustment) belong to no day, so there is nothing to approve and
 * blocking would be a deadlock rather than a control.
 *
 * A PENDING RECEIPT blocks too, and it is checked here rather than anywhere else
 * for the same reason the server routes it through one `voucherSendGate()`: two
 * places deciding whether a week may go out is two places that can disagree.
 * Note the asymmetry with days — silence on a day blocks, but a receipt is born
 * in a state and only a manual self-log is born pending.
 */
export function buildSendGate(
	days: PaymentVoucherDayReview[],
	receipts: { receiptNo: string; status: PaymentVoucherReceiptStatus }[] = [],
): PvSendGate {
	const pendingReceipts = receipts
		.filter((r) => r.status === "pending")
		.map((r) => r.receiptNo);
	if (days.length === 0 && pendingReceipts.length === 0) return ALLOWED;

	const heldDays = days.filter((d) => d.status === "held").map((d) => d.date);
	// A stale day arrives with status null — the server already dropped it back to
	// unreviewed — so it counts here as needing another look, not as approved.
	const unreviewedDays = days
		.filter((d) => d.status === null)
		.map((d) => d.date);
	if (
		heldDays.length === 0 &&
		unreviewedDays.length === 0 &&
		pendingReceipts.length === 0
	) {
		return ALLOWED;
	}

	const parts: string[] = [];
	if (heldDays.length > 0) parts.push(`${heldDays.length} day(s) held`);
	if (unreviewedDays.length > 0) {
		parts.push(`${unreviewedDays.length} day(s) not yet reviewed`);
	}
	if (pendingReceipts.length > 0) {
		parts.push(`${pendingReceipts.length} receipt(s) not yet reviewed`);
	}

	return {
		allowed: false,
		heldDays,
		unreviewedDays,
		pendingReceipts,
		reason: parts.join(" · "),
	};
}

/**
 * The agency's day-by-day sign-off on one voucher.
 *
 * Rides on the same detail fetch as the receipt-evidence panel (one voucher on
 * screen, one request) and invalidates that shared key after every decision, so
 * the two panels can never show decisions and lines from different reads.
 *
 * `sendGate` is the whole reason this hook exists beyond listing the days: the
 * backend refuses a send that has a held or unreviewed day, and a button
 * offering an action guaranteed to 409 is worse than one that explains itself.
 */
export function useAgencyPvDayReview(voucherId: string | null) {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const { voucher, isBacked, isLoading } = useAgencyPvEvidence(voucherId);

	// Both reads, because a day decision now moves two things: the day itself and
	// the receipts that day is made of. Refreshing only the evidence detail left
	// the Receipts sub-tab showing "Waiting on you" for receipts the server had
	// already approved.
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: pvEvidenceKey(voucherId) });
		queryClient.invalidateQueries({ queryKey: agencyReceiptsKey });
		queryClient.invalidateQueries({ queryKey: ["agency", "payment-vouchers"] });
	};

	const reviewMut = useMutation({
		mutationFn: (vars: {
			date: string;
			status: PaymentVoucherDayStatus | null;
			note?: string;
		}) =>
			reviewPaymentVoucherDay(
				voucherId as string,
				vars.date,
				{ status: vars.status, note: vars.note },
				logout,
			),
		onSuccess: invalidate,
	});

	const approveAllMut = useMutation({
		mutationFn: () => approveAllPaymentVoucherDays(voucherId as string, logout),
		onSuccess: invalidate,
	});

	const days = useMemo<PaymentVoucherDayReview[]>(
		() => voucher?.dayReviews ?? [],
		[voucher],
	);

	// Until the fetch resolves we do not know whether a day is held, so the gate
	// stays closed on a backed voucher. Open would mean offering a send we cannot
	// yet say is legal; a demo voucher has no days to review and is never gated.
	const isResolved = !isBacked || Boolean(voucher);
	// The receipts ride on the same detail read as the days, so the gate judges
	// both halves of one response — never a day from one read against a receipt
	// from another.
	const receipts = useMemo(() => voucher?.receipts ?? [], [voucher]);
	const sendGate = useMemo<PvSendGate>(() => {
		if (!isBacked) return ALLOWED;
		if (!isResolved) {
			return {
				allowed: false,
				heldDays: [],
				unreviewedDays: [],
				pendingReceipts: [],
				reason: "Checking this week's day review…",
			};
		}
		return buildSendGate(days, receipts);
	}, [days, receipts, isBacked, isResolved]);

	return {
		days,
		/** False for demo vouchers, which have no backend row to review. */
		isBacked,
		isLoading,
		sendGate,
		decidedCount: days.filter((d) => d.status !== null).length,
		staleCount: days.filter((d) => d.stale).length,
		reviewDay: reviewMut.mutateAsync,
		approveAll: approveAllMut.mutateAsync,
		isSaving: reviewMut.isPending || approveAllMut.isPending,
	};
}
