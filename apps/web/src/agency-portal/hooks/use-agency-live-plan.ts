import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	fetchMemberSubscriptions,
	type MemberBillingCycle,
} from "@/services/member-subscription";

/** The one plan row an agency is on — the `member_subscription` it holds today. */
export type AgencyLivePlan = {
	planName: string | null;
	amountRm: number | null;
	billingCycle: MemberBillingCycle | null;
};

/**
 * "Starter · RM 125.00/Week" — from the plan row, never from a price table.
 *
 * The plan NAME stays as stored: plan names are English by the owner's
 * instruction and deliberately absent from the dictionary. A zero amount is the
 * negotiated tier awaiting its price, which the rate card calls "renegotiate";
 * no row at all says so rather than naming a plan the agency is not on.
 */
export function agencyLivePlanLabel(
	plan: AgencyLivePlan,
	t: PortalTranslations,
): string {
	if (!plan.planName) return t.agencyPv.noActivePlan;
	const amount = plan.amountRm ?? 0;
	if (!(amount > 0))
		return `${plan.planName} · ${t.subscription.priceRenegotiate}`;
	const formatted = amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const price =
		plan.billingCycle === "weekly" || plan.billingCycle === null
			? fill(t.subscription.perWeekPrice, { amount: formatted })
			: fill(t.subscription.pricePerCycle, {
					amount: formatted,
					cycle: t.subscription.billedMonthly,
				});
	return `${plan.planName} · ${price}`;
}

/**
 * THE PLAN THIS AGENCY IS ACTUALLY ON — for the Payroll header.
 *
 * That header priced the week off the DEMO plan table by the selected tab's
 * voucher count: right only while the tab held five or fewer and the agency sat
 * on Starter. The payment week collects every outstanding voucher from every
 * week, so a sixth one there announced "Plus · RM 250.00/Week" to an agency
 * billed RM 125 — a demo figure on a real session.
 *
 * Same query key and parameters as `useAgencySubscription`'s own read, so the
 * two screens share one request and cannot disagree. `backed` is false on a
 * demo session, which keeps its demo header.
 */
export function useAgencyLivePlan(): AgencyLivePlan & {
	backed: boolean;
	isLoading: boolean;
	/** A read that failed is not "no plan" — the caller shows nothing instead. */
	isError: boolean;
} {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const agencyId = identity?.agencyId ?? null;
	const query = useQuery({
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
		enabled: identity !== null,
		staleTime: 60_000,
	});
	const current = query.data?.data?.[0] ?? null;
	return {
		backed: identity !== null,
		isLoading: query.isLoading,
		isError: query.isError,
		planName: current?.planName ?? null,
		amountRm: current ? Number(current.amount) : null,
		billingCycle: current?.billingCycle ?? null,
	};
}
