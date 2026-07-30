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

	const posQuoteMut = useMutation({
		mutationFn: (input: CreateAdminRequestInput) =>
			createAdminRequest(input, logout),
	});

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
		isLoading: billingQuery.isLoading,
		isRequestingQuote: posQuoteMut.isPending,
		requestPosQuote,
	};
}
