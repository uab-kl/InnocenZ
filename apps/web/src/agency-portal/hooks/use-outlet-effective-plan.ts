import {
	getOutletSubscriptionPlan,
	OUTLET_SUBSCRIPTION_PLANS,
	type OutletSubscriptionPlan,
} from "@agency-portal/lib/outlet-demo";
import { useStore } from "@agency-portal/lib/store";
import { useMemo } from "react";
import { useOutletSubscription } from "./use-outlet-subscription";

/**
 * Which subscription plan gates this venue — THE one answer for every screen
 * that enforces plan limits (Post Job's PR-per-day cap, the named-PR picker).
 *
 * A real session reads the venue's ACTIVE `member_subscription` row — the same
 * ledger the Subscription page's "Current" pill reads — so the two screens can
 * never disagree. They did (owner, 20 Aug 2026): Subscription said Enterprise
 * while Post Job capped the composer at Essential's 5 PRs/day, because Post Job
 * still read the demo store's `subscriptionPlanId`, which no backend write
 * ever touches.
 *
 * Demo sessions — and a backed venue with no active ledger row yet — fall back
 * to the demo store's plan id, which keeps the old behaviour exactly.
 */
export function useOutletEffectivePlan(): OutletSubscriptionPlan {
	const planId = useStore((s) => s.outletOwner.subscriptionPlanId);
	const backend = useOutletSubscription();
	return useMemo(() => {
		if (backend.backed && backend.activePlanName) {
			const ledger = OUTLET_SUBSCRIPTION_PLANS.find(
				(plan) =>
					plan.label.trim().toLowerCase() ===
					backend.activePlanName?.trim().toLowerCase(),
			);
			if (ledger) return ledger;
		}
		return getOutletSubscriptionPlan(planId);
	}, [backend.backed, backend.activePlanName, planId]);
}
