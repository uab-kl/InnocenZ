import {
	type OutletCutLossShiftSlice,
	outletShiftDemandSupplied,
} from "@agency-portal/lib/outlet-demo";

/**
 * How loud a sidebar badge is allowed to be.
 *
 * The owner's colour code (23 Aug 2026) reads AMBER as waiting and RED as
 * disputed or deducted, and it is the same code every receipt and PV surface
 * follows. A queue of work nobody has got to yet is waiting, so almost every
 * badge here is amber; red is reserved for the one case where a PR is already
 * contesting money. Painting a backlog red would put "six sign-ups to read" in
 * the same visual class as "somebody says you underpaid them".
 */
export type NavAlertTone = "amber" | "red";

export interface NavAlert {
	/** How many things are waiting. Never rendered at 0 — see the builders. */
	count: number;
	tone: NavAlertTone;
}

/** Keyed by the nav item's `to` path, so the sidebar looks a badge up by route. */
export type NavAlertMap = Record<string, NavAlert>;

/**
 * A badge is only ever built from a NON-ZERO count.
 *
 * Returning `{count: 0}` and hiding it at the render site works right up until
 * the second render site forgets to, and then the rail carries a row of grey
 * zeroes that teach people to stop reading it. Absent is the honest shape for
 * "nothing waiting".
 */
function alert(count: number, tone: NavAlertTone): NavAlert | null {
	return count > 0 ? { count, tone } : null;
}

function compact(entries: [string, NavAlert | null][]): NavAlertMap {
	const map: NavAlertMap = {};
	for (const [to, value] of entries) {
		if (value) map[to] = value;
	}
	return map;
}

export interface AgencyNavAlertInput {
	/** Everything the Approvals page's tabs add up to — `useAgencyApprovalQueue`. */
	approvals: number;
	/**
	 * Vouchers waiting on the agency, by the Payroll page own rule — see
	 * `countPvsNeedingAction`. Named for what it counts rather than for one
	 * status: it was `pendingReview`, and the name is what made it easy to keep
	 * counting a third of the pile while the page counted all of it.
	 */
	vouchers: number;
	/** OPEN rows in the dispute table — not vouchers flipped to DISPUTED. */
	disputes: number;
	/** Receipts still at `pending`; each one blocks its voucher from being sent. */
	receipts: number;
	/** Undecided overtime claims; each one holds its whole payroll week. */
	overtime: number;
	/** Unpaid billing periods this agency owes InnocenZ. */
	unpaidPeriods: number;
}

/**
 * The agency rail's badges.
 *
 * PAYROLL IS ONE NUMBER, not four. Its four queues — review, disputes,
 * receipts, overtime — all live behind sub-tabs on `/agency/pv`, and the rail
 * has one row to point at. Splitting them across rows that do not exist would
 * mean inventing nav items; summing them answers the question the rail is
 * actually asked, which is "is there anything through that door".
 *
 * PAYROLL IS ALWAYS RED (owner, 8 Sep 2026). It used to turn red only when a
 * dispute was in the pile and sit amber otherwise, which meant the one row on
 * the rail that is always about MONEY changed colour depending on which of its
 * four queues happened to be filled — and the payroll tabs it opens are red
 * throughout. One row, one colour, matching the page behind it.
 *
 * The dispute is not lost by this: it still has its own count on the Disputes
 * sub-tab, and the page's own copy names it. What is lost is a colour CHANGE
 * nobody was watching for on a row they read as "money waiting" either way.
 */
export function agencyNavAlerts(input: AgencyNavAlertInput): NavAlertMap {
	const payroll =
		input.vouchers + input.disputes + input.receipts + input.overtime;
	return compact([
		["/agency/pending", alert(input.approvals, "amber")],
		["/agency/pv", alert(payroll, "red")],
		["/agency/subscription", alert(input.unpaidPeriods, "amber")],
	]);
}

export interface OutletNavAlertInput {
	/** Upcoming shifts still short of people — see `countShiftsNeedingStaff`. */
	shiftsNeedingStaff: number;
	/** Unpaid billing periods this outlet owes InnocenZ. */
	unpaidPeriods: number;
	/**
	 * People asking to join this venue's team.
	 *
	 * ⚠️ It points at the venue's own Approvals page. It first pointed at
	 * SETTINGS, because that is where the queue used to live — buried below the
	 * profile and the notification toggles, where the owner went looking for it
	 * twice and did not find it. The page moved; this must move with it, or the
	 * badge sends the reader to a page that no longer holds the thing it counts.
	 */
	pendingMembers: number;
}

/**
 * The outlet rail's badges.
 *
 * Amber on both: a shift nobody has filled yet is waiting, and so is a billing
 * period nobody has settled. Neither is a dispute, and the venue portal has no
 * red queue of its own — the disputes on this platform are raised against an
 * AGENCY's voucher, which is not the venue's business (see the payment-voucher
 * router, admin/agency only).
 */
export function outletNavAlerts(input: OutletNavAlertInput): NavAlertMap {
	return compact([
		["/outlet", alert(input.shiftsNeedingStaff, "amber")],
		["/outlet/approvals", alert(input.pendingMembers, "amber")],
		["/outlet/subscription", alert(input.unpaidPeriods, "amber")],
	]);
}

type NavAlertShift = OutletCutLossShiftSlice & {
	prs?: string[];
	releasedEarlyPrIds?: string[];
	suppliedTotal?: number;
	status?: string;
};

/**
 * How many of these shifts still need somebody.
 *
 * SHIFTS, not seats. The badge answers "how many rows on Today want looking
 * at", which is a count of things to open; a seat count would read as three
 * problems where there is one shift three people short.
 *
 * Staffing comes from `outletShiftDemandSupplied`, the SAME helper the shift
 * cards and the cut-loss path use — never from `prs.length`. A shift posted to
 * two agencies shows each of them only its own assignments, so counting `prs`
 * locally is how one agency's screen called a half-filled shift empty
 * (`outletShiftSuppliedCount` carries the full account of that).
 *
 * A sealed shift is finished and a draft was never posted, so neither is
 * waiting on anyone.
 */
export function countShiftsNeedingStaff(shifts: NavAlertShift[]): number {
	return shifts.filter((shift) => {
		if (shift.status === "sealed" || shift.status === "draft") return false;
		return outletShiftDemandSupplied(shift).openSlots > 0;
	}).length;
}
