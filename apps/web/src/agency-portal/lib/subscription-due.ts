/**
 * WHEN A SUBSCRIPTION PERIOD IS DUE, and how late it is.
 *
 * ⚠️ DERIVED, NOT STORED — deliberately, and this needed no migration.
 * `subscription_invoice` carries `period_start`, `period_end`, `status`,
 * `paid_at` and `amount`, and nothing anywhere in the schema holds a due date.
 * A due date computed from the period end and the plan's own cadence is a fact
 * about the billing RULES, not about the row: storing it would let a historical
 * invoice disagree with the terms it was raised under, and would need a
 * backfill for every period already issued.
 *
 * THE RULE, in one line: an invoice is due `grace` days after its period ENDS.
 *
 * Grace exists because a period cannot be billed before it finishes — the
 * platform bills for what was used — so the payer needs time after that. It is
 * SEVEN DAYS for both cadences (owner, 8 Sep 2026): monthly began on net-14 and
 * was levelled to match weekly, because one rule the whole platform can state in
 * a sentence beats two that have to be looked up. For a weekly agency that is a
 * full cycle of grace; for a monthly outlet it is a week to settle a month.
 *
 * Worked through the live rows on 8 Sep 2026, weekly at RM 125:
 *   16–22 Aug    → due 29 Aug → 10 days OVERDUE
 *   23–29 Aug    → due  5 Sep →  3 days OVERDUE
 *   30 Aug–5 Sep → due 12 Sep → due in 4 days (DUE SOON)
 *   6–12 Sep     → period still running → NOT YET DUE
 */
import {
	addDays,
	differenceInCalendarDays,
	format,
	isValid,
	parseISO,
} from "date-fns";

/** The cadences `member_subscription.billing_cycle` actually holds today. */
export type BillingCycle = "weekly" | "monthly";

/**
 * Where a period stands.
 *
 * `due_soon` and `overdue` are deliberately the SAME words the collections
 * aging pills already use (`collections.ts`), so the platform keeps one
 * vocabulary for "is this late" rather than two that have to be kept in step.
 */
export type DueBucket = "paid" | "not_yet_due" | "due_soon" | "overdue";

/**
 * Days after the period ends before payment is late.
 *
 * ⚠️ THE POLICY LIVES HERE, in one place, and is the only thing to edit if the
 * owner wants different terms. It is not per-customer: nothing in the schema can
 * express a negotiated term, and that is exactly what a `due_date` column would
 * be for. If terms ever vary by customer, THAT is the moment to add one.
 */
export const GRACE_DAYS: Record<BillingCycle, number> = {
	weekly: 7,
	/*
	 * 7, NOT 14 (owner, 8 Sep 2026). Monthly started on the ordinary net-14 term
	 * and the owner levelled both to one week: one rule the whole platform can
	 * state in a sentence beats two that have to be looked up.
	 *
	 * ⚠️ It is still keyed BY CYCLE rather than collapsed to a single constant.
	 * The terms happening to be equal is a policy decision that can be reversed;
	 * the shape that lets it be reversed costs nothing to keep. Note that while
	 * they ARE equal, nothing observable distinguishes the two paths — a test
	 * cannot prove the cadence is consulted by reading a due date.
	 */
	monthly: 7,
};

/** Half the grace, so "due soon" scales with the cadence instead of being a second constant. */
function dueSoonWindow(cycle: BillingCycle): number {
	return Math.floor(GRACE_DAYS[cycle] / 2);
}

/** The only shape this module needs from a `subscription_invoice` row. */
export type DueInvoiceLike = {
	/**
	 * `period_start`. Used ONLY to tell one billing window from another when
	 * counting: several invoices share a window (plan + add-on) and the list
	 * groups them into one card, so the count has to collapse them too.
	 */
	periodStart?: string | null;
	/** `period_end`, as YYYY-MM-DD or an ISO timestamp. */
	periodEnd?: string | null;
	/** `status` — anything not recognisably unpaid counts as settled. */
	status?: string | null;
	/** `paid_at`; a stamp is proof of payment even when `status` lags. */
	paidAt?: string | null;
	/** `amount`, the string a numeric(12,2) serializes to. */
	amount?: string | number | null;
	/**
	 * The plan's own cadence, joined from `member_subscription.billing_cycle`
	 * and already on the client DTO.
	 *
	 * Preferred over the `cycle` argument wherever present, so a list holding
	 * more than one subscription — an outlet's plan beside its POS add-on —
	 * cannot have one lane's term applied to the other. The argument stays as
	 * the fallback for a row that arrived without it.
	 */
	billingCycle?: string | null;
};

/** The invoice's own cadence when it has one, else the caller's. */
function cycleOf(
	invoice: DueInvoiceLike,
	fallback: BillingCycle,
): BillingCycle {
	const own = (invoice.billingCycle ?? "").trim().toLowerCase();
	return own === "weekly" || own === "monthly" ? own : fallback;
}

function toDate(iso: string | null | undefined): Date | null {
	if (!iso) return null;
	const d = parseISO(iso);
	return isValid(d) ? d : null;
}

/**
 * Is this invoice settled?
 *
 * Reads BOTH `paid_at` and `status`: the stamp is the stronger evidence (money
 * actually moved) and `status` has lagged behind reality elsewhere in this
 * codebase. Anything not recognisably unpaid is treated as SETTLED rather than
 * warned about — a false "OVERDUE" on an invoice somebody already paid is the
 * one error that would make this feature worse than not having it.
 */
export function isSettled(invoice: DueInvoiceLike): boolean {
	if (invoice.paidAt) return true;
	const status = (invoice.status ?? "").trim().toLowerCase();
	if (!status) return false;
	return !["unpaid", "pending", "open", "issued", "overdue", "failed"].includes(
		status,
	);
}

export type DueStatus = {
	bucket: DueBucket;
	/** The due date as YYYY-MM-DD, or null when `period_end` was unreadable. */
	dueIso: string | null;
	/** Whole days LATE. 0 unless `bucket === "overdue"`. */
	daysOverdue: number;
	/** Whole days until due. 0 once due or past it. */
	daysUntilDue: number;
	/** The period has not finished, so it cannot be late whatever the date says. */
	periodInProgress: boolean;
};

/**
 * Where one invoice stands, as of `today`.
 *
 * `today` is a REQUIRED argument rather than `new Date()` inside: this is money
 * arithmetic that has to be testable at a fixed date, and a hidden clock is what
 * makes an "it was fine yesterday" bug impossible to reproduce.
 */
export function dueStatusFor(
	invoice: DueInvoiceLike,
	cycle: BillingCycle,
	today: Date,
): DueStatus {
	const base: DueStatus = {
		bucket: "not_yet_due",
		dueIso: null,
		daysOverdue: 0,
		daysUntilDue: 0,
		periodInProgress: false,
	};

	if (isSettled(invoice)) return { ...base, bucket: "paid" };
	const term = cycleOf(invoice, cycle);

	const end = toDate(invoice.periodEnd);
	// An unreadable period end means the due date is UNKNOWN, which is not the
	// same as "not late" — but printing a date we cannot compute would be worse.
	// No date, no warning; the row simply shows nothing.
	if (!end) return base;

	const due = addDays(end, GRACE_DAYS[term]);
	const dueIso = format(due, "yyyy-MM-dd");

	// A period still running cannot be late. The current week appears in this
	// list and is payable in advance, so it has to read "not yet due" rather
	// than joining the overdue pile the moment its arithmetic lands.
	if (differenceInCalendarDays(end, today) >= 0) {
		return {
			...base,
			dueIso,
			periodInProgress: true,
			daysUntilDue: Math.max(0, differenceInCalendarDays(due, today)),
		};
	}

	const daysPastDue = differenceInCalendarDays(today, due);
	// Due ON the due date, late the day AFTER: `> 0`, never `>= 0`. Someone
	// paying on the morning of the 12th has paid on time.
	if (daysPastDue > 0) {
		return { ...base, bucket: "overdue", dueIso, daysOverdue: daysPastDue };
	}

	const daysUntilDue = -daysPastDue;
	return {
		...base,
		bucket: daysUntilDue <= dueSoonWindow(term) ? "due_soon" : "not_yet_due",
		dueIso,
		daysUntilDue,
	};
}

/** `numeric` arrives as a string; every money path needs a number. */
function amountRm(invoice: DueInvoiceLike): number {
	const parsed = Number(invoice.amount);
	return Number.isFinite(parsed) ? parsed : 0;
}

export type OverdueSummary = {
	/** How many billing WINDOWS are past due — not how many invoice rows. */
	count: number;
	/** What they come to, summed in integer cents. */
	amountRm: number;
	/** The due date of the OLDEST overdue period, YYYY-MM-DD. */
	oldestDueIso: string | null;
	/** How late that oldest one is, in whole days. */
	oldestDaysOverdue: number;
};

/**
 * The headline warning: what is actually LATE, not merely unpaid.
 *
 * ⚠️ That distinction is the whole point. The screen already shows an UNPAID
 * total, and that figure includes the period running right now — money nobody
 * is late with. Warning on "unpaid" would tell an agency that pays on time,
 * every single week, that it is in arrears every single week, and a warning
 * that is always on is a warning nobody reads.
 *
 * Summed in integer cents for the same reason `sumCollectionRm` is: this is a
 * figure someone gets chased for.
 */
export function overdueSummary(
	invoices: DueInvoiceLike[],
	cycle: BillingCycle,
	today: Date,
): OverdueSummary {
	let cents = 0;
	let oldestDueIso: string | null = null;
	let oldestDaysOverdue = 0;
	/*
	 * COUNT WINDOWS, NOT ROWS.
	 *
	 * One billing period can hold several invoices — an outlet's plan beside its
	 * POS add-on — and the list below groups them into ONE card. Counting rows
	 * made the banner say "3 billing periods" above a single red row, which the
	 * agency's data could never reveal because an agency only ever has one lane.
	 * The MONEY is still summed per row; it is only the count that collapses.
	 */
	const windows = new Set<string>();

	for (const invoice of invoices) {
		const status = dueStatusFor(invoice, cycle, today);
		if (status.bucket !== "overdue") continue;
		windows.add(`${invoice.periodStart ?? ""}|${invoice.periodEnd ?? ""}`);
		cents += Math.round(amountRm(invoice) * 100);
		if (status.daysOverdue > oldestDaysOverdue) {
			oldestDaysOverdue = status.daysOverdue;
			oldestDueIso = status.dueIso;
		}
	}

	return {
		// Same rule as `countBillingWindows`, applied to the late subset only.
		count: windows.size,
		amountRm: cents / 100,
		oldestDueIso,
		oldestDaysOverdue,
	};
}

/**
 * HOW MANY BILLING PERIODS these invoices cover — not how many rows they are.
 *
 * ⚠️ A period can hold SEVERAL invoices: an outlet pays a plan and a POS add-on
 * for the same window, and the payment list groups them into one card. Counting
 * rows made three different places say "5 billing periods" over two cards — the
 * UNPAID tile, the POS settle-first notices, and (until it was fixed) the
 * overdue banner.
 *
 * An AGENCY cannot reveal this: it only ever holds one lane, so its row count
 * and its period count agree by accident. Every count of periods on these
 * screens goes through here so they cannot drift apart again.
 */
export function countBillingWindows(invoices: DueInvoiceLike[]): number {
	const windows = new Set<string>();
	for (const invoice of invoices) {
		windows.add(`${invoice.periodStart ?? ""}|${invoice.periodEnd ?? ""}`);
	}
	return windows.size;
}

/** "29 Aug 2026" — the form the subscription screens already print dates in. */
export function formatDueDate(dueIso: string | null): string {
	const d = toDate(dueIso);
	return d ? format(d, "d MMM yyyy") : "";
}
