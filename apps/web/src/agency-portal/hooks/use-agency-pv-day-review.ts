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
import { useAgencyOvertime } from "./use-agency-overtime";
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
	/**
	 * Shift dates whose overtime claim nobody has decided yet. Blocks for the
	 * same reason the server blocks: overtime is paid on the voucher of the week
	 * it was WORKED, so the week cannot close with a claim outstanding.
	 */
	pendingOvertime: string[];
	/** Null when allowed. */
	reason: string | null;
}

const ALLOWED: PvSendGate = {
	allowed: true,
	heldDays: [],
	unreviewedDays: [],
	pendingReceipts: [],
	pendingOvertime: [],
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
 *
 * UNDECIDED OVERTIME blocks as well, and it is the one term this mirror did not
 * carry until 3 Sep 2026. The gap was not cosmetic: PV-000009 held two pending
 * claims, so the button rendered enabled and every click 409'd — and `patch()`
 * had no `onError`, so the refusal was invisible. A mirror missing a term the
 * server enforces does not merely under-report; it offers an action that cannot
 * work, which is the thing this gate exists to stop.
 */
export function buildSendGate(
	// Unused since the day terms left the gate; kept so no caller changes shape.
	_days: PaymentVoucherDayReview[],
	receipts: { receiptNo: string; status: PaymentVoucherReceiptStatus }[] = [],
	/** Shift dates, already narrowed to this voucher's PR and week by the caller. */
	pendingOvertime: string[] = [],
): PvSendGate {
	const pendingReceipts = receipts
		.filter((r) => r.status === "pending")
		.map((r) => r.receiptNo);
	/*
	 * THE DAY TERMS ARE GONE, here as on the server (owner's call, 23 Aug
	 * 2026): the receipt statuses are the review, so a pending receipt and an
	 * undecided overtime claim are the two things that block from this side —
	 * the same two the server's `voucherSendGate()` weighs. The result shape
	 * keeps the day fields, always empty, so no reader breaks.
	 */
	if (pendingReceipts.length === 0 && pendingOvertime.length === 0)
		return ALLOWED;

	const heldDays: string[] = [];
	const unreviewedDays: string[] = [];
	const parts: string[] = [];
	if (pendingReceipts.length > 0) {
		parts.push(`${pendingReceipts.length} receipt(s) not yet reviewed`);
	}
	// Worded like the server's own refusal, dates and all, so what the agency
	// reads BEFORE clicking and what the toast says AFTER clicking are one
	// sentence rather than two versions of it.
	if (pendingOvertime.length > 0) {
		parts.push(
			`${pendingOvertime.length} overtime claim(s) not yet decided: ${pendingOvertime.join(", ")}`,
		);
	}

	return {
		allowed: false,
		heldDays,
		unreviewedDays,
		pendingReceipts,
		pendingOvertime,
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
	/*
	 * The agency's overtime worklist — the SAME query the Overtime tab reads
	 * (one key, one request, one answer). Deliberately not a new endpoint
	 * scoped to this voucher: the tab the agency is being sent to and the gate
	 * sending them there must be looking at the same list, or the caption can
	 * name a claim the tab does not show.
	 *
	 * Already agency-scoped server-side. If the read fails — a viewer role has
	 * no `canWrite` on it — the list is empty and this term simply stops
	 * blocking, which is exactly the behaviour that shipped before this gate
	 * knew about overtime at all. Failing open here is safe because the server
	 * still refuses the send; failing CLOSED would brick the button for a role
	 * that cannot see why.
	 */
	const { claims: overtimeClaims, isLoading: overtimeLoading } =
		useAgencyOvertime();

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
	const isResolved = (!isBacked || Boolean(voucher)) && !overtimeLoading;
	// The receipts ride on the same detail read as the days, so the gate judges
	// both halves of one response — never a day from one read against a receipt
	// from another.
	const receipts = useMemo(() => voucher?.receipts ?? [], [voucher]);
	/*
	 * The claims that belong to THIS voucher: its PR, inside its week.
	 *
	 * Narrowed on the voucher's own `weekStart`/`weekEnd` rather than on the
	 * week the claim reports, because that is the pair the server measures
	 * against (`listPendingOvertimeForPrWeek`), and a gate that agreed with the
	 * server about WHETHER to block but not about WHICH claims would name the
	 * wrong dates in its own explanation.
	 *
	 * A voucher with no PR or no week has nothing to ask about and blocks on
	 * nothing — the same shape as the server's own empty-list case.
	 */
	const pendingOvertime = useMemo(() => {
		const prId = voucher?.prId;
		const weekStart = voucher?.weekStart;
		const weekEnd = voucher?.weekEnd;
		if (!prId || !weekStart || !weekEnd) return [];
		return overtimeClaims
			.filter((c) => c.prId === prId)
			.map((c) => (c.shiftDate ?? "").slice(0, 10))
			.filter((day) => day >= weekStart && day <= weekEnd)
			.sort();
	}, [overtimeClaims, voucher]);
	const sendGate = useMemo<PvSendGate>(() => {
		if (!isBacked) return ALLOWED;
		if (!isResolved) {
			return {
				allowed: false,
				heldDays: [],
				unreviewedDays: [],
				pendingReceipts: [],
				pendingOvertime: [],
				reason: "Checking this week's day review…",
			};
		}
		return buildSendGate(days, receipts, pendingOvertime);
	}, [days, receipts, pendingOvertime, isBacked, isResolved]);

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
