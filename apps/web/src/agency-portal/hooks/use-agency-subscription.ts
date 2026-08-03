import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
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
	fetchMyCustomQuote,
	fetchMyPlanChange,
} from "@/services/admin-request";
import { fetchMemberSubscriptions } from "@/services/member-subscription";
import { fetchSubscriptions, type Subscription } from "@/services/subscription";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The agency tier priced per agency rather than off the rate card. */
const CUSTOM = "Custom";

/**
 * Outcome of asking to switch. `reason` carries the server's own words when it
 * refuses (e.g. "Already on Growth — no switch needed"), so the agency is told
 * what actually happened instead of a blanket "try again".
 */
export interface AgencyPlanChangeResult {
	ok: boolean;
	reason?: string;
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

	const billingHistory = useMemo<SubscriptionRecordRow[]>(
		() =>
			sortMemberSubscriptions(historyQuery.data?.data ?? []).map((sub) =>
				subscriptionRecordFromMember(sub, "InnocenZ Agency"),
			),
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

	/** Whether this agency is on the negotiated tier today, and at what price. */
	const onCustom = current?.planName === CUSTOM;
	const customAmountRm = onCustom ? Number(current?.amount ?? 0) : null;

	/** Match a catalog plan by name, case/space-insensitively. */
	const findPlan = (label: string): Subscription | null =>
		(plansQuery.data?.data ?? []).find(
			(plan) =>
				plan.subscriptionType === "agency" &&
				plan.name.trim().toLowerCase() === label.trim().toLowerCase(),
		) ?? null;

	/**
	 * This agency's own outstanding requests, read back from the server — the
	 * same pair the outlet reads. Without them the "waiting for admin" state
	 * lived only in React: a refresh forgot it, the agency asked again, and the
	 * admin queue filled with duplicates for one decision.
	 */
	const pendingQuery = useQuery({
		queryKey: ["admin-request", "mine", "plan-change"],
		queryFn: () => fetchMyPlanChange(logout),
		enabled: backed,
		staleTime: 15_000,
	});

	const customQuery = useQuery({
		queryKey: ["admin-request", "mine", "custom-quote"],
		queryFn: () => fetchMyCustomQuote(logout),
		enabled: backed,
		staleTime: 15_000,
	});

	const planNameById = useMemo(
		() => new Map((plansQuery.data?.data ?? []).map((p) => [p.id, p.name])),
		[plansQuery.data],
	);

	/** The tier this agency is waiting on, or null when nothing is pending. */
	const pendingPlanLabel = useMemo<string | null>(() => {
		const requestedId = pendingQuery.data?.requestedPlanId;
		return requestedId ? (planNameById.get(requestedId) ?? null) : null;
	}, [pendingQuery.data, planNameById]);

	/**
	 * What the open Custom request asks for: joining/re-pricing Custom, or coming
	 * off it onto the named tier. Null when there is no open request.
	 */
	const customRequestLabel = useMemo<string | null>(() => {
		const open = customQuery.data;
		if (!open) return null;
		const requested = open.requestedPlanId
			? (planNameById.get(open.requestedPlanId) ?? null)
			: null;
		if (!requested || requested === CUSTOM) return CUSTOM;
		return `Cancel · ${requested} only`;
	}, [customQuery.data, planNameById]);

	const requestMut = useMutation({
		mutationFn: (input: CreateAdminRequestInput) =>
			createAdminRequest(input, logout),
		// Re-read the server's answer so the badge reflects what was actually filed.
		// The ledger too: an ordinary agency switch is applied on the spot
		// ('direct'), so the current tier and the record below change immediately.
		onSuccess: () => {
			void pendingQuery.refetch();
			void customQuery.refetch();
			void memberQuery.refetch();
			void historyQuery.refetch();
		},
	});

	const fileRequest = async (
		input: Omit<CreateAdminRequestInput, "subscriberType" | "subscriberName">,
	): Promise<AgencyPlanChangeResult> => {
		if (!identity || !agencyId) return { ok: false };
		try {
			await requestMut.mutateAsync({
				...input,
				subscriberType: "agency",
				subscriberId: UUID_RE.test(agencyId) ? agencyId : undefined,
				subscriberName: identity.orgName,
			});
			return { ok: true };
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			// Its plan may have moved under us; re-read so the card is honest.
			void memberQuery.refetch();
			return { ok: false, reason: message };
		}
	};

	/**
	 * Ask to move onto another tier.
	 *
	 * Ordinary tier → ordinary tier is filed as a `plan_change`, which the server
	 * applies straight away ('direct'): agency tiers follow PV volume and carry a
	 * list price, so there is nothing for an admin to decide.
	 *
	 * Anything touching Custom is filed as a `custom_renegotiation` and WAITS —
	 * exactly as the outlet's POS add-on does. Joining Custom has no price until
	 * the admin sets one (its catalog price is a zero placeholder), and leaving it
	 * ends a price the agency must not be able to end by itself. Filed as a
	 * plan_change instead, joining Custom billed the agency RM 0 the moment it
	 * tapped, which is how Atlas ended up on Custom at nothing.
	 */
	const requestPlanChange = async (
		toPlanLabel: string,
	): Promise<AgencyPlanChangeResult> => {
		const target = findPlan(toPlanLabel);
		if (!target) {
			return {
				ok: false,
				reason: `${toPlanLabel} is not in the InnocenZ agency plan list — contact admin`,
			};
		}
		const negotiated = target.name === CUSTOM || onCustom;
		return fileRequest({
			type: negotiated ? "custom_renegotiation" : "plan_change",
			currentPlanId: current?.subscriptionId ?? undefined,
			requestedPlanId: target.id,
			message:
				target.name === CUSTOM
					? "Requesting a Custom price for our agency."
					: onCustom
						? `Requesting to end our Custom price and move to ${target.name}.`
						: `Requesting a switch to ${target.name} (RM ${target.price} / ${target.billingCycle}).`,
		});
	};

	/** Ask the admin to quote the Custom price again, keeping the tier meanwhile. */
	const requestCustomRequote = async (): Promise<AgencyPlanChangeResult> => {
		const custom = findPlan(CUSTOM);
		if (!custom) {
			return {
				ok: false,
				reason: "Custom is not in the InnocenZ agency plans",
			};
		}
		return fileRequest({
			type: "custom_renegotiation",
			currentPlanId: current?.subscriptionId ?? undefined,
			requestedPlanId: custom.id,
			message: "Requesting a new Custom price for our agency.",
		});
	};

	return {
		backed,
		plans,
		billingHistory,
		currentSubscriptionId: current?.subscriptionId ?? null,
		currentPlanName: current?.planName ?? null,
		/** Real amount billed for the current tier; null when nothing is active. */
		currentAmountRm: current ? Number(current.amount) : null,
		onCustom,
		customAmountRm,
		/** Tier awaiting admin approval — survives a refresh; null once answered. */
		pendingPlanLabel,
		/** True while a Custom price request is with the admin (server truth). */
		customRequestPending: Boolean(customQuery.data),
		customRequestLabel,
		requestPlanChange,
		requestCustomRequote,
		isRequesting: requestMut.isPending,
		/** False until the catalog has loaded — no switch can be filed yet. */
		planCatalogReady: plans.length > 0,
		isLoading: plansQuery.isLoading || memberQuery.isLoading,
		isHistoryLoading: historyQuery.isLoading,
	};
}
