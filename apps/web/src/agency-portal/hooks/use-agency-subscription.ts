import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchMemberSubscriptions } from "@/services/member-subscription";
import { fetchSubscriptions, type Subscription } from "@/services/subscription";

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
		currentSubscriptionId: current?.subscriptionId ?? null,
		currentPlanName: current?.planName ?? null,
		isLoading: plansQuery.isLoading || memberQuery.isLoading,
	};
}
