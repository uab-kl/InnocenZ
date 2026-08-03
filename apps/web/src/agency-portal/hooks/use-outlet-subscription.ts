import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	type SubscriptionRecordRow,
	sortMemberSubscriptions,
	subscriptionRecordFromMember,
} from "@agency-portal/lib/subscription-record";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CreateAdminRequestInput,
	createAdminRequest,
} from "@/services/admin-request";
import { fetchMemberSubscriptions } from "@/services/member-subscription";
import { fetchSubscriptions } from "@/services/subscription";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contact details for a POS-quote request (from the outlet owner profile). */
export interface PosQuoteContact {
	email?: string;
	phone?: string;
}

/**
 * Backend-driven subscription data for the outlet portal.
 *
 * Gated on a real session (`getOutletIdentity()`); demo sessions get `backed:
 * false` and keep the demo store. Wires the two genuinely backend-backed parts:
 * - **Subscription record:** the `member_subscription` ledger for this outlet.
 *   NOT an invoice list — one row per subscription, no payment state — so it no
 *   longer maps onto the demo's invoice card shape. It used to, and collapsing
 *   the four real statuses into that shape's SETTLED/PENDING meant a *cancelled*
 *   subscription rendered a green "Paid" pill.
 * - **POS-integration quote:** creates an `admin_request`
 *   (`type: 'pos_integration_quote'`) for admin follow-up.
 *
 * The plan rate-card + current-plan selector stay on demo data (the backend
 * plan catalog lacks the outlet PR-per-day / pool business rules the picker
 * needs), and payment-card is bucket-B (never stored). The outlet cannot READ
 * admin_requests (that route is admin-only), so the "request sent" pending
 * indicator stays an optimistic local flag in the store.
 */
export function useOutletSubscription() {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletId = identity?.outletId ?? null;

	const billingQuery = useQuery({
		queryKey: ["member-subscription", "outlet", outletId ?? "none"],
		queryFn: () =>
			fetchMemberSubscriptions(
				{
					subscriberType: "outlet",
					subscriberId: outletId ?? undefined,
					pageSize: 100,
				},
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	const billingHistory = useMemo<SubscriptionRecordRow[]>(() => {
		if (!backed) return [];
		return sortMemberSubscriptions(billingQuery.data?.data ?? []).map((sub) =>
			subscriptionRecordFromMember(sub, "InnocenZ Outlet"),
		);
	}, [backed, billingQuery.data]);

	/**
	 * The plan this venue is ACTUALLY on, from its active `member_subscription`
	 * row — the same ledger admin History reads, so the two screens can no longer
	 * disagree. Null when the venue has no active row, and the caller then falls
	 * back to the demo plan rather than inventing one.
	 */
	const activePlanName = useMemo<string | null>(() => {
		if (!backed) return null;
		const active = sortMemberSubscriptions(billingQuery.data?.data ?? []).find(
			(sub) => sub.status === "active",
		);
		return active?.planName ?? null;
	}, [backed, billingQuery.data]);

	const posQuoteMut = useMutation({
		mutationFn: (input: CreateAdminRequestInput) =>
			createAdminRequest(input, logout),
	});

	/**
	 * The admin-managed plan catalog. Reads are open to any signed-in role, which
	 * is what lets the venue turn the plan it tapped into the real `subscription`
	 * row id the admin queue and the billing ledger are keyed on. Without the id
	 * the request would arrive as prose that nothing can act on.
	 */
	const plansQuery = useQuery({
		queryKey: ["subscriptions", "outlet-plan-catalog"],
		queryFn: () => fetchSubscriptions({ pageSize: 100 }, logout),
		enabled: backed,
		staleTime: 5 * 60_000,
	});

	const outletPlans = useMemo(
		() =>
			(plansQuery.data?.data ?? []).filter(
				(plan) => plan.subscriptionType === "outlet",
			),
		[plansQuery.data],
	);

	/** Match a plan by name, case/space-insensitively ("Pro" -> the Pro row). */
	const findPlan = (label: string) =>
		outletPlans.find(
			(plan) => plan.name.trim().toLowerCase() === label.trim().toLowerCase(),
		) ?? null;

	const planChangeMut = useMutation({
		mutationFn: (input: CreateAdminRequestInput) =>
			createAdminRequest(input, logout),
	});

	/**
	 * Ask the admin to move this venue onto another plan.
	 *
	 * An outlet switch is a REQUEST, not an act: the backend files it as
	 * `admin_request` (type `plan_change`, status `pending`) and only an admin
	 * approval writes the `member_subscription` ledger. So the venue's own screen
	 * must not claim the new plan is live — see the caller, which shows "waiting
	 * for admin" rather than switching the Current pill.
	 *
	 * Returns false when the plan cannot be resolved against the real catalog, so
	 * the caller can say so instead of showing a success it did not get.
	 */
	const requestPlanChange = async (params: {
		toPlanLabel: string;
		fromPlanLabel?: string;
		contact?: PosQuoteContact;
	}): Promise<boolean> => {
		if (!identity) return false;
		const target = findPlan(params.toPlanLabel);
		if (!target) return false;
		const from = params.fromPlanLabel ? findPlan(params.fromPlanLabel) : null;
		const email = params.contact?.email?.trim();
		await planChangeMut.mutateAsync({
			type: "plan_change",
			subscriberType: "outlet",
			subscriberId: UUID_RE.test(identity.outletId)
				? identity.outletId
				: undefined,
			subscriberName: identity.outletName,
			currentPlanId: from?.id,
			requestedPlanId: target.id,
			contactEmail: email && EMAIL_RE.test(email) ? email : undefined,
			contactPhone: params.contact?.phone?.trim() || undefined,
			message: `Requesting a switch${
				from ? ` from ${from.name}` : ""
			} to ${target.name} (RM ${target.price} / ${target.billingCycle}).`,
		});
		return true;
	};

	const requestPosQuote = async (contact: PosQuoteContact = {}) => {
		if (!identity) return;
		const email = contact.email?.trim();
		await posQuoteMut.mutateAsync({
			type: "pos_integration_quote",
			subscriberType: "outlet",
			subscriberId: UUID_RE.test(identity.outletId)
				? identity.outletId
				: undefined,
			subscriberName: identity.outletName,
			contactEmail: email && EMAIL_RE.test(email) ? email : undefined,
			contactPhone: contact.phone?.trim() || undefined,
			message: "Requesting POS integration quote for our venue.",
		});
	};

	return {
		backed,
		billingHistory,
		activePlanName,
		isLoading: billingQuery.isLoading,
		isRequestingQuote: posQuoteMut.isPending,
		requestPosQuote,
		requestPlanChange,
		isRequestingPlanChange: planChangeMut.isPending,
		/** False until the catalog has loaded — the switch cannot be filed yet. */
		planCatalogReady: outletPlans.length > 0,
	};
}
