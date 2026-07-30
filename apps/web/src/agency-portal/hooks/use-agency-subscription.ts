import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchMemberSubscriptions,
	type MemberSubscription,
	type MemberSubscriptionStatus,
} from "@/services/member-subscription";
import { fetchSubscriptions, type Subscription } from "@/services/subscription";

/**
 * One row of the agency's subscription record with InnocenZ.
 *
 * Named a "record" rather than an invoice on purpose. `member_subscription` is a
 * "who subscribed and when" ledger — one row per subscription, carrying
 * `startedAt`, `endedAt`, `amount` and `billingCycle`. It is NOT one row per
 * charge, and it holds no payment state, so nothing here can honestly say a
 * given week or month was paid.
 */
export interface AgencyBillingRow {
	id: string;
	title: string;
	detail: string;
	dateLabel: string;
	amountRm: number;
	statusLabel: string;
	tone: "green" | "amber" | "ink";
}

/**
 * Deliberately NOT collapsed to paid/unpaid. `active` means the subscription is
 * running, which is not the same claim as "this was paid" — and `cancelled`
 * flattened into a green "Paid" pill would be a plain misstatement.
 */
const MEMBER_STATUS: Record<
	MemberSubscriptionStatus,
	{ label: string; tone: AgencyBillingRow["tone"] }
> = {
	active: { label: "Active", tone: "green" },
	past_due: { label: "Past due", tone: "amber" },
	cancelled: { label: "Cancelled", tone: "ink" },
	expired: { label: "Ended", tone: "ink" },
};

function billingRowFromMemberSubscription(
	sub: MemberSubscription,
): AgencyBillingRow {
	const cycle =
		sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1);
	const status = MEMBER_STATUS[sub.status] ?? {
		label: sub.status,
		tone: "ink" as const,
	};
	return {
		id: sub.id,
		title: `InnocenZ Agency · ${sub.planName}`,
		detail: sub.endedAt
			? `${cycle} billing · ended ${fmtDateLabelFromIso(sub.endedAt.slice(0, 10))}`
			: `${cycle} billing`,
		dateLabel: fmtDateLabelFromIso(sub.startedAt.slice(0, 10)),
		// numeric over the wire; the screen needs a number.
		amountRm: Number(sub.amount) || 0,
		statusLabel: status.label,
		tone: status.tone,
	};
}

/** Rate-card plan shape the Subscription screen renders (demo-plan compatible). */
export interface AgencyRatePlan {
	id: string;
	label: string;
	weeklyRm: number | null;
	priceLabel: string | null;
	capacityLabel: string;
	description: string;
}

function ratePlanFromBackend(sub: Subscription): AgencyRatePlan {
	const price = Number(sub.price);
	const hasPrice = Number.isFinite(price) && price > 0;
	const weekly = sub.billingCycle === "weekly";
	return {
		id: sub.id,
		label: sub.name,
		weeklyRm: weekly && hasPrice ? price : null,
		// Non-weekly or zero-price plans show a label instead of a /week amount.
		priceLabel: !hasPrice
			? "Renegotiate Price"
			: weekly
				? null
				: `RM ${price.toLocaleString()} / ${sub.billingCycle}`,
		capacityLabel: sub.coverage ?? "—",
		// The backend has no marketing blurb; the coverage carries the tier label.
		description: "",
	};
}

/** Starter → … → Scale by weekly price; Custom / renegotiate last. */
function compareAgencyRatePlans(a: AgencyRatePlan, b: AgencyRatePlan): number {
	const aPrice = a.weeklyRm;
	const bPrice = b.weeklyRm;
	if (aPrice == null && bPrice == null) return a.label.localeCompare(b.label);
	if (aPrice == null) return 1;
	if (bPrice == null) return -1;
	return aPrice - bPrice;
}

/**
 * Backend-driven Subscription rate card + the agency's assigned plan.
 *
 * Gated on a real session (`getAgencyIdentity()`); demo sessions get `backed:
 * false` and the screen keeps its demo plans + usage-based tier. Plans are
 * scoped with `subscriptionType: "agency"` so outlet monthly tiers never leak
 * into the rate card. ACCEPTED DEGRADATION: the screen's hero tier is derived
 * from weekly-PV usage, which the backend does NOT model — the backend stores
 * an ASSIGNED plan (`member-subscription`). So the rate card lists real agency
 * plans and the "Your tier" highlight prefers the real assigned plan
 * (`currentSubscriptionId`), falling back to a usage-derived label match. Plan
 * marketing descriptions have no backend and render empty.
 *
 * `billingHistory` is the agency's own subscription record — what it owes
 * InnocenZ. Not to be confused with `use-agency-collections`, which is what
 * OUTLETS owe the agency: opposite direction, different table. Conflating the two
 * is exactly the mistake that nearly got made here, since the demo store kept
 * both behind one `agencyCollections` key split by a `kind` field.
 */
export function useAgencySubscription() {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;

	const plansQuery = useQuery({
		queryKey: ["agency", "subscription", "plans", "agency"],
		queryFn: () =>
			fetchSubscriptions(
				{ status: "active", subscriptionType: "agency", pageSize: 100 },
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	const memberQuery = useQuery({
		queryKey: ["agency", "subscription", "member", agencyId ?? "none"],
		queryFn: () =>
			fetchMemberSubscriptions(
				{
					subscriberType: "agency",
					subscriberId: agencyId as string,
					status: "active",
					pageSize: 5,
				},
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	/**
	 * Separate from `memberQuery` above rather than widening it. That one filters
	 * to `status: "active"` and is consumed as `data[0]` to answer "which plan is
	 * this agency on" — drop the filter and a cancelled row could become the
	 * current plan.
	 */
	const historyQuery = useQuery({
		queryKey: ["agency", "subscription", "history", agencyId ?? "none"],
		queryFn: () => fetchMemberSubscriptions({ pageSize: 50 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const billingHistory = useMemo<AgencyBillingRow[]>(
		() =>
			(historyQuery.data?.data ?? [])
				.slice()
				.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
				.map(billingRowFromMemberSubscription),
		[historyQuery.data],
	);

	const plans = useMemo<AgencyRatePlan[]>(
		() =>
			(plansQuery.data?.data ?? [])
				.filter((sub) => sub.subscriptionType === "agency")
				.map(ratePlanFromBackend)
				.sort(compareAgencyRatePlans),
		[plansQuery.data],
	);

	const current = useMemo(
		() => memberQuery.data?.data?.[0] ?? null,
		[memberQuery.data],
	);

	return {
		backed,
		plans,
		billingHistory,
		currentSubscriptionId: current?.subscriptionId ?? null,
		currentPlanName: current?.planName ?? null,
		isLoading: plansQuery.isLoading || memberQuery.isLoading,
		isHistoryLoading: historyQuery.isLoading,
	};
}
