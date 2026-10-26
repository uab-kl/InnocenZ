import type {
	PenaltyProposal,
	UnchargedCancellation,
	UnchargedPenalty,
} from "@/services/agency-uncharged";

/**
 * ONE PR'S PENALTIES, from the rows Payroll reads — for the Manage PR profile.
 *
 * The profile evaluated breaches in the browser from `shiftsThisWeek`,
 * `lateThisWeek` and `mcThisMonth`, fields only demo PRs carry, so on a real
 * session it always said there were none. These are the SAME three reads the
 * Payroll "Uncharged penalties & fees" panel and the Manage PR list use, cut to
 * one person:
 *
 *  - this week's rule breaches the backend found and nobody has recorded yet
 *    (`penalty-proposals`, unsealed only — a sealed one is a charge below);
 *  - recorded weekly penalties not yet billed (`uncharged.penalties`);
 *  - cancellation fees sealed when the PR cancelled, not yet billed
 *    (`uncharged.cancellations`).
 *
 * `prId` on all three IS the user id, which is the id the Manage PR roster keys
 * on (`managedPrFromBackend`). A cancellation also carries `userId`; either
 * matches.
 */
export type PrPenaltyItem = {
	key: string;
	/** The API's `rule_type`; a cancellation fee is "cancellation". */
	ruleType: string;
	fineRm: number;
	/** The server's own sentence about the numbers (weekly penalties only). */
	detail: string | null;
	/** The shift a cancellation fee is for, yyyy-MM-dd. */
	shiftDate: string | null;
	outletName: string | null;
	/** Recorded as owed (a real charge) — vs. only a finding nobody recorded. */
	recorded: boolean;
};

const money = (value: string | null | undefined): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

export function prPenaltyItems(
	prId: string,
	sources: {
		proposals: readonly PenaltyProposal[];
		penalties: readonly UnchargedPenalty[];
		cancellations: readonly UnchargedCancellation[];
	},
): PrPenaltyItem[] {
	const items: PrPenaltyItem[] = [];
	for (const p of sources.proposals) {
		if (p.prId !== prId || p.sealed) continue;
		items.push({
			key: `proposal-${p.ruleType}-${p.weekStart}`,
			ruleType: p.ruleType,
			fineRm: money(p.fineRm),
			detail: p.detail || null,
			shiftDate: null,
			outletName: null,
			recorded: false,
		});
	}
	for (const c of sources.penalties) {
		if (c.prId !== prId) continue;
		items.push({
			key: `charge-${c.chargeId}`,
			ruleType: c.ruleType,
			fineRm: money(c.fineRm),
			detail: c.detail || null,
			shiftDate: null,
			outletName: null,
			recorded: true,
		});
	}
	for (const c of sources.cancellations) {
		if (c.prId !== prId && c.userId !== prId) continue;
		const fee = money(c.feeRm);
		// A cancellation with no fee owes nothing; it is not a penalty.
		if (fee <= 0) continue;
		items.push({
			key: `cancel-${c.assignmentId}`,
			ruleType: "cancellation",
			fineRm: fee,
			detail: null,
			shiftDate: c.shiftDate,
			outletName: c.outletName,
			recorded: true,
		});
	}
	return items;
}

/** What the items come to, summed in integer cents. */
export function prPenaltyTotalRm(items: readonly PrPenaltyItem[]): number {
	return (
		items.reduce((cents, item) => cents + Math.round(item.fineRm * 100), 0) /
		100
	);
}
