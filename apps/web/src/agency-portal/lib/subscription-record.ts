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
