import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	MemberSubscription,
	MemberSubscriptionStatus,
} from "@/services/member-subscription";

/**
 * One row of an org's subscription record with InnocenZ. Shared by the agency and
 * outlet Subscription screens, which show the same table from the same side.
 *
 * Called a "record" rather than an invoice on purpose. `member_subscription` is a
 * "who subscribed and when" ledger — one row per subscription, carrying
 * `startedAt`, `endedAt`, `amount` and `billingCycle`. It is NOT one row per
 * charge, and it holds no payment state, so nothing built on it can honestly say
 * a given week or month was paid.
 */
export interface SubscriptionRecordRow {
	id: string;
	title: string;
	detail: string;
	dateLabel: string;
	amountRm: number;
	statusLabel: string;
	tone: "green" | "amber" | "ink";
}

/**
 * Deliberately NOT collapsed to paid/unpaid.
 *
 * `active` means the subscription is running, which is not the same claim as
 * "this was paid", and `cancelled` flattened into a green "Paid" pill is an
 * outright misstatement — which is exactly what both screens used to render.
 */
export const MEMBER_STATUS: Record<
	MemberSubscriptionStatus,
	{
		label: (t: PortalTranslations) => string;
		tone: SubscriptionRecordRow["tone"];
	}
> = {
	active: { label: (t) => t.subscription.statusActive, tone: "green" },
	past_due: { label: (t) => t.subscription.statusPastDue, tone: "amber" },
	cancelled: { label: (t) => t.subscription.statusCancelled, tone: "ink" },
	expired: { label: (t) => t.subscription.statusEnded, tone: "ink" },
};

/**
 * The billing cycle as a word. `sub.billingCycle` is the stored enum
 * (weekly | monthly | annually); an unrecognised one falls through capitalised,
 * the same contract as an unrecognised status.
 */
function cycleWord(cycle: string, t: PortalTranslations): string {
	if (cycle === "weekly") return t.subscription.billedWeekly;
	if (cycle === "monthly") return t.subscription.billedMonthly;
	if (cycle === "annually") return t.subscription.billedAnnually;
	return cycle.charAt(0).toUpperCase() + cycle.slice(1);
}

/**
 * `orgLabel` is the plan's owner as the screen names it — "InnocenZ Agency" or
 * "InnocenZ Outlet". It is passed in rather than derived from
 * `sub.subscriberType`, because it is display copy each screen already owns.
 */
export function subscriptionRecordFromMember(
	sub: MemberSubscription,
	orgLabel: string,
	t: PortalTranslations,
): SubscriptionRecordRow {
	const cycle = cycleWord(sub.billingCycle, t);
	// An unrecognised status falls back to showing the raw value rather than
	// guessing a tone — a new enum value must not silently render as paid.
	const status = MEMBER_STATUS[sub.status] ?? {
		label: () => sub.status,
		tone: "ink" as const,
	};
	return {
		id: sub.id,
		title: `${sub.subscriberName?.trim() || orgLabel} · ${sub.planName}`,
		detail: sub.endedAt
			? fill(t.subscription.billingCycleEnded, {
					cycle,
					date: fmtDateLabelFromIso(sub.endedAt.slice(0, 10)),
				})
			: fill(t.subscription.billingCycleLine, { cycle }),
		dateLabel: fmtDateLabelFromIso(sub.startedAt.slice(0, 10)),
		// numeric over the wire; every display path needs a number.
		amountRm: Number(sub.amount) || 0,
		statusLabel: status.label(t),
		tone: status.tone,
	};
}

/**
 * A row the org is NO LONGER on, described as what it actually is: a plan
 * CHANGE, not a subscription that was paid for.
 *
 * `member_subscription` records what was subscribed to and when — a switch ends
 * one row and starts another — and it holds no payment state at all. Rendered
 * with the ordinary builder, an ended row reads *"Tue · 04 Aug 2026 · Monthly
 * billing · ended Tue · 04 Aug 2026"*: a start date, a billing cycle and an end
 * date, i.e. every part of a term that was invoiced. Almost none of these were.
 * Most start and end on the SAME DAY, because they are the trail left by trying
 * plans out, so this says so in place of a billing cycle the org was never
 * charged on.
 */
export function planChangeRecordFromMember(
	sub: MemberSubscription,
	orgLabel: string,
	t: PortalTranslations,
): SubscriptionRecordRow {
	const status = MEMBER_STATUS[sub.status] ?? {
		label: () => sub.status,
		tone: "ink" as const,
	};
	const startIso = sub.startedAt.slice(0, 10);
	const endIso = sub.endedAt ? sub.endedAt.slice(0, 10) : null;
	return {
		id: sub.id,
		title: `${sub.subscriberName?.trim() || orgLabel} · ${sub.planName}`,
		dateLabel: fill(t.subscription.onDate, {
			date: fmtDateLabelFromIso(startIso),
		}),
		detail: !endIso
			? ""
			: endIso === startIso
				? t.subscription.switchedSameDay
				: fill(t.subscription.untilDate, {
						date: fmtDateLabelFromIso(endIso),
					}),
		amountRm: Number(sub.amount) || 0,
		statusLabel: status.label(t),
		tone: status.tone,
	};
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
	invoices: { periodEnd: string; kind?: string }[],
): Date | null {
	let latest: string | null = null;
	for (const invoice of invoices) {
		if (invoice.kind && invoice.kind !== "period") continue;
		if (!latest || invoice.periodEnd > latest) latest = invoice.periodEnd;
	}
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
