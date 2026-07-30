import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	approveAllPaymentVoucherDays,
	type PaymentVoucherDayReview,
	type PaymentVoucherDayStatus,
	reviewPaymentVoucherDay,
} from "@/services/payment-voucher";
import { pvEvidenceKey, useAgencyPvEvidence } from "./use-agency-pvs";

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
	/** Null when allowed. */
	reason: string | null;
}

const ALLOWED: PvSendGate = {
	allowed: true,
	heldDays: [],
	unreviewedDays: [],
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
 */
export function buildSendGate(days: PaymentVoucherDayReview[]): PvSendGate {
	if (days.length === 0) return ALLOWED;

	const heldDays = days.filter((d) => d.status === "held").map((d) => d.date);
	// A stale day arrives with status null — the server already dropped it back to
	// unreviewed — so it counts here as needing another look, not as approved.
	const unreviewedDays = days
		.filter((d) => d.status === null)
		.map((d) => d.date);
	if (heldDays.length === 0 && unreviewedDays.length === 0) return ALLOWED;

	const parts: string[] = [];
	if (heldDays.length > 0) parts.push(`${heldDays.length} day(s) held`);
	if (unreviewedDays.length > 0) {
		parts.push(`${unreviewedDays.length} day(s) not yet reviewed`);
	}

	return {
		allowed: false,
		heldDays,
		unreviewedDays,
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

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: pvEvidenceKey(voucherId) });

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
	const sendGate = useMemo<PvSendGate>(() => {
		if (!isBacked) return ALLOWED;
		if (!isResolved) {
			return {
				allowed: false,
				heldDays: [],
				unreviewedDays: [],
				reason: "Checking this week's day review…",
			};
		}
		return buildSendGate(days);
	}, [days, isBacked, isResolved]);

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
