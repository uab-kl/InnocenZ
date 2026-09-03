import { format, parseISO } from "date-fns";
import type { MemberSubscription } from "@/services/member-subscription";

/** One opened billing period, as the ledger states it (KL calendar days). */
export interface BillingWindow {
	periodStart: string;
	periodEnd: string;
}

/**
 * The window an org is IN today on one lane: the latest period the ledger has
 * opened among the invoices given. Pass ONE lane's invoices — the plan's and
 * the POS add-on's are anchored on different days, and the later of the two
 * would otherwise claim the other's dates. Upgrade lines are skipped: they
 * share the window of the period they belong to and carry no dates of their
 * own. Null until the first period is minted.
 */
export function currentPeriodOf(
	invoices: { periodStart: string; periodEnd: string; kind?: string }[],
): BillingWindow | null {
	let latest: BillingWindow | null = null;
	for (const invoice of invoices) {
		if (invoice.kind && invoice.kind !== "period") continue;
		if (!latest || invoice.periodEnd > latest.periodEnd) {
			latest = {
				periodStart: invoice.periodStart,
				periodEnd: invoice.periodEnd,
			};
		}
	}
	return latest;
}

/** "1 Aug – 31 Aug 2026", with the year printed once. */
export function periodLabel(startIso: string, endIso: string): string {
	try {
		const start = parseISO(startIso);
		const end = parseISO(endIso);
		const sameYear = start.getFullYear() === end.getFullYear();
		return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
	} catch {
		return `${startIso} – ${endIso}`;
	}
}

/** Newest subscription first. */
export function sortMemberSubscriptions(
	rows: MemberSubscription[],
): MemberSubscription[] {
	return rows.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * When this subscription is next billed: its start rolled forward by the billing
 * cycle until the date is in the future. Null when there is nothing active — the
 * caller then shows nothing rather than a made-up date. Both Subscription screens
 * printed a hardcoded date before this existed, and both printed one that had
 * already passed.
 *
 * Monthly/annual bill on the SAME DAY each period, so every date is computed from
 * the ORIGINAL start rather than by stepping a date forward repeatedly, which
 * drifts: stepping 31 Jan by one month lands on 3 Mar, because "31 Feb" overflows.
 * The day is clamped to the target month's length instead, so a subscription that
 * started on the 31st bills on the 28th/30th in short months and returns to the
 * 31st afterwards.
 */
/**
 * When the org is next billed, read from the BILLING CALENDAR — the day after
 * the latest period the ledger has opened on its plan lane.
 *
 * `nextRenewalFrom` below rolls the current subscription row's start date
 * forward, which is wrong the moment a plan is switched: the row starts on the
 * switch day, the calendar does not. Emhub switched on 28 Aug and the screen
 * said "renews 28 Sept" over a history that plainly ran 3 Aug – 2 Sep. The
 * invoices are the calendar, so they win; the start-date rule is the fallback
 * for an org that has no period opened yet.
 *
 * Callers pass plan-lane invoices only: an add-on has its own anchor, and its
 * later period end would push the plan's renewal to the wrong day.
 */
export function nextRenewalFromInvoices(
	invoices: { periodStart: string; periodEnd: string; kind?: string }[],
): Date | null {
	const latest = currentPeriodOf(invoices)?.periodEnd ?? null;
	if (!latest) return null;
	const [y, m, d] = latest.split("-").map(Number);
	if (!y || !m || !d) return null;
	// Local calendar day, +1 — a period end is a date, not an instant.
	return new Date(y, m - 1, d + 1);
}

export function nextRenewalFrom(
	startedAt: string | null | undefined,
	billingCycle: string | null | undefined,
): Date | null {
	if (!startedAt) return null;
	const start = new Date(startedAt);
	if (Number.isNaN(start.getTime())) return null;
	const now = new Date();

	if (billingCycle === "weekly") {
		const next = new Date(start);
		while (next <= now) next.setDate(next.getDate() + 7);
		return next;
	}

	const step = billingCycle === "annually" ? 12 : 1;
	const anchorDay = start.getDate();
	const at = (periods: number) => {
		const year = start.getFullYear();
		const month = start.getMonth() + periods * step;
		const lastDay = new Date(year, month + 1, 0).getDate();
		return new Date(
			year,
			month,
			Math.min(anchorDay, lastDay),
			start.getHours(),
			start.getMinutes(),
			start.getSeconds(),
		);
	};

	let periods = 0;
	let next = at(0);
	while (next <= now && periods < 600) {
		periods += 1;
		next = at(periods);
	}
	return next;
}

/** The same date as a short label ("3 Sept 2026"), or null. */
export function renewalLabelFrom(
	startedAt: string | null | undefined,
	billingCycle: string | null | undefined,
): string | null {
	const next = nextRenewalFrom(startedAt, billingCycle);
	return next
		? next.toLocaleDateString("en-GB", {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: null;
}
