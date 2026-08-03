import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
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
	{ label: string; tone: SubscriptionRecordRow["tone"] }
> = {
	active: { label: "Active", tone: "green" },
	past_due: { label: "Past due", tone: "amber" },
	cancelled: { label: "Cancelled", tone: "ink" },
	expired: { label: "Ended", tone: "ink" },
};

/**
 * `orgLabel` is the plan's owner as the screen names it — "InnocenZ Agency" or
 * "InnocenZ Outlet". It is passed in rather than derived from
 * `sub.subscriberType`, because it is display copy each screen already owns.
 */
export function subscriptionRecordFromMember(
	sub: MemberSubscription,
	orgLabel: string,
): SubscriptionRecordRow {
	const cycle =
		sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1);
	// An unrecognised status falls back to showing the raw value rather than
	// guessing a tone — a new enum value must not silently render as paid.
	const status = MEMBER_STATUS[sub.status] ?? {
		label: sub.status,
		tone: "ink" as const,
	};
	return {
		id: sub.id,
		title: `${sub.subscriberName?.trim() || orgLabel} · ${sub.planName}`,
		detail: sub.endedAt
			? `${cycle} billing · ended ${fmtDateLabelFromIso(sub.endedAt.slice(0, 10))}`
			: `${cycle} billing`,
		dateLabel: fmtDateLabelFromIso(sub.startedAt.slice(0, 10)),
		// numeric over the wire; every display path needs a number.
		amountRm: Number(sub.amount) || 0,
		statusLabel: status.label,
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
