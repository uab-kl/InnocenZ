import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	type BillingWindow,
	currentPeriodOf,
	nextRenewalFrom,
	nextRenewalFromInvoices,
	sortMemberSubscriptions,
} from "@agency-portal/lib/subscription-record";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CreateAdminRequestInput,
	createAdminRequest,
	fetchMyPlanChange,
	fetchMyPosQuote,
	withdrawMyAdminRequest,
} from "@/services/admin-request";
import { fetchMemberSubscriptions } from "@/services/member-subscription";
import {
	fetchMyPaymentMethod,
	removeMyPaymentMethod,
	type SavePaymentMethodInput,
	saveMyPaymentMethod,
} from "@/services/payment-method";
import { fetchSubscriptions } from "@/services/subscription";
import {
	fetchSubscriptionInvoices,
	type SubscriptionInvoice,
} from "@/services/subscription-invoice";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contact details for a POS-quote request (from the outlet owner profile). */
export interface PosQuoteContact {
	email?: string;
	phone?: string;
}

/**
 * Outcome of asking to switch. `reason` carries the server's own words when it
 * refuses (e.g. "Already on Essential — no switch needed") so the venue is told
 * what actually happened instead of a blanket "try again".
 */
export interface PlanChangeResult {
	ok: boolean;
	reason?: string;
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

	/**
	 * The admin-managed plan catalog. Reads are open to any signed-in role, which
	 * is what lets the venue turn the plan it tapped into the real `subscription`
	 * row id the admin queue and the billing ledger are keyed on, and what tells
	 * a plan apart from an add-on. Declared here because the reads below need it.
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
				(plan) => plan.subscriptionType === "outlet" && plan.kind !== "addon",
			),
		[plansQuery.data],
	);

	/**
	 * Add-ons (POS Integration) sit in the same ledger as plans, so they are told
	 * apart by the product they reference. Without this split the venue's add-on
	 * line — newer than its plan — would be read as its current plan.
	 */
	const addonPlanIds = useMemo(
		() =>
			new Set(
				(plansQuery.data?.data ?? [])
					.filter((plan) => plan.kind === "addon")
					.map((plan) => plan.id),
			),
		[plansQuery.data],
	);

	/**
	 * Everything this venue has been on and is no longer — ended, cancelled, past
	 * due. Kept out of the list above and shown behind a disclosure, because it is
	 * reference, not a bill: these rows carry no payment state, so a venue reading
	 * six priced cards in a column has no way to tell they are history.
	 */
	/**
	 * What this venue has actually been BILLED, period by period — the billing
	 * ledger, not the subscription ledger.
	 *
	 * `member_subscription` cannot answer this: it holds no payment state, which
	 * is why the history under this screen could only ever be a list of plan
	 * switches. `subscription_invoice` is one row per MONTHLY period (outlets are
	 * billed monthly; agencies weekly) carrying a status an InnocenZ admin sets,
	 * so the venue reads the same fact the admin does. Scoped server-side to this
	 * outlet — the endpoint overwrites any subscriber filter a client sends.
	 */
	const invoicesQuery = useQuery({
		queryKey: ["subscription-invoice", "outlet", outletId ?? "none"],
		queryFn: () => fetchSubscriptionInvoices({ pageSize: 60 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const paymentHistory = useMemo<SubscriptionInvoice[]>(
		() => invoicesQuery.data?.data ?? [],
		[invoicesQuery.data],
	);

	/**
	 * WHICH LANE each billed period belongs to — the plan, or the POS add-on.
	 *
	 * A venue holding both is billed on BOTH every month, so Payment history shows
	 * two rows for one month and, until now, nothing on them said which was which.
	 * Two amounts for one month with no label is how a venue concludes it was
	 * double-billed.
	 *
	 * Resolved through the invoice's `memberSubscriptionId` FK into the rows this
	 * hook already holds, then classified against the plan catalogue's own `kind`
	 * — never by matching the plan NAME, which would break the moment an add-on is
	 * renamed or a plan happens to contain the word "POS".
	 *
	 * Returns null rather than guessing when the subscription row is not in hand
	 * (they are fetched at pageSize 100, so only a venue with a very long
	 * switching history could reach that). A missing badge is honest; a wrong one
	 * is not.
	 */
	const invoiceLaneById = useMemo(() => {
		const laneOf = new Map<string, "plan" | "addon">();
		for (const sub of billingQuery.data?.data ?? []) {
			laneOf.set(
				sub.id,
				sub.subscriptionId && addonPlanIds.has(sub.subscriptionId)
					? "addon"
					: "plan",
			);
		}
		return laneOf;
	}, [billingQuery.data, addonPlanIds]);

	const invoiceLane = (invoice: SubscriptionInvoice): "plan" | "addon" | null =>
		invoiceLaneById.get(invoice.memberSubscriptionId) ?? null;

	const activeSubscription = useMemo(() => {
		if (!backed) return null;
		return (
			sortMemberSubscriptions(billingQuery.data?.data ?? []).find(
				(sub) =>
					sub.status === "active" &&
					!(sub.subscriptionId && addonPlanIds.has(sub.subscriptionId)),
			) ?? null
		);
	}, [backed, billingQuery.data, addonPlanIds]);

	/** The venue's live POS add-on, at the price the admin agreed. */
	const activeAddon = useMemo(() => {
		if (!backed) return null;
		return (
			sortMemberSubscriptions(billingQuery.data?.data ?? []).find(
				(sub) =>
					sub.status === "active" &&
					sub.subscriptionId &&
					addonPlanIds.has(sub.subscriptionId),
			) ?? null
		);
	}, [backed, billingQuery.data, addonPlanIds]);

	const activePlanName = activeSubscription?.planName ?? null;

	/**
	 * When this venue is next billed. The rule lives in subscription-record.ts
	 * because the agency screen bills on the same rule — two copies is how one of
	 * them ends up a month out.
	 */
	const nextRenewalDate = useMemo<Date | null>(
		() =>
			// The billing calendar wins: the day after the latest PLAN-lane period
			// the ledger has opened. The start-date rule is only the fallback for a
			// venue with no period yet — rolled from the switch day it read
			// "renews 28 Sept" over a history running 3 Aug – 2 Sep.
			nextRenewalFromInvoices(
				paymentHistory.filter(
					(invoice) =>
						invoiceLaneById.get(invoice.memberSubscriptionId) !== "addon",
				),
			) ??
			nextRenewalFrom(
				activeSubscription?.startedAt,
				activeSubscription?.billingCycle,
			),
		[activeSubscription, paymentHistory, invoiceLaneById],
	);

	/**
	 * EACH LANE'S CURRENT BILLING WINDOW, and the add-on's own renewal — what the
	 * plan card and the POS card print (owner, 2 Sep 2026: "where is the start
	 * activation date and the renewal date, for both plan" / "the date duration
	 * shows here"). Read from each lane's own invoices: POS is bought after the
	 * plan, so its month can start on a different day, and every venue's month
	 * runs from its own activation day because the ledger is anchored there.
	 */
	const laneDates = useMemo(() => {
		if (!backed) {
			return {
				planWindow: null as BillingWindow | null,
				addonWindow: null as BillingWindow | null,
				addonRenewalDate: null as Date | null,
			};
		}
		const laneInvoices = (lane: "plan" | "addon") =>
			paymentHistory.filter(
				(invoice) => invoiceLaneById.get(invoice.memberSubscriptionId) === lane,
			);
		const addonInvoices = laneInvoices("addon");
		return {
			planWindow: currentPeriodOf(laneInvoices("plan")),
			addonWindow: currentPeriodOf(addonInvoices),
			addonRenewalDate:
				nextRenewalFromInvoices(addonInvoices) ??
				nextRenewalFrom(activeAddon?.startedAt, activeAddon?.billingCycle),
		};
	}, [backed, paymentHistory, invoiceLaneById, activeAddon]);

	/**
	 * The venue's own outstanding POS-integration quote, from the server — so the
	 * "Request sent" state survives a refresh instead of resetting to a button
	 * that invites the venue to ask a second time.
	 */
	const posQuoteQuery = useQuery({
		queryKey: ["admin-request", "mine", "pos-quote"],
		queryFn: () => fetchMyPosQuote(logout),
		enabled: backed,
		staleTime: 15_000,
	});

	const posQuoteMut = useMutation({
		mutationFn: (input: CreateAdminRequestInput) =>
			createAdminRequest(input, logout),
		onSuccess: () => void posQuoteQuery.refetch(),
	});

	/**
	 * Taking the POS request back. Refetches the same query the request was read
	 * from, so the card stops saying "waiting for admin" because the SERVER says
	 * so — not because a local flag was cleared. That flag was the whole fault
	 * here: it hid the badge while the admin still held the request.
	 */
	const withdrawPosMut = useMutation({
		mutationFn: (id: string) => withdrawMyAdminRequest(id, logout),
		onSuccess: () => void posQuoteQuery.refetch(),
	});

	/**
	 * Withdraw whatever POS request is outstanding. False when there is nothing
	 * to withdraw or the server refused — the caller must not clear its own
	 * indicator on a refusal, or the card lies again in the other direction.
	 */
	const withdrawPosRequest = async (): Promise<boolean> => {
		const id = posQuoteQuery.data?.id;
		if (!id) return false;
		try {
			const result = await withdrawPosMut.mutateAsync(id);
			return result.success;
		} catch {
			return false;
		}
	};

	/**
	 * The venue's saved card. Real, and the only source — the page used to print
	 * a hardcoded "Visa ···· 4242", which is a card nobody owns.
	 *
	 * Scoped from the session server-side; `outletId` is sent so an operator who
	 * holds several venues edits the right one's card, and the server checks it
	 * against the venues they actually hold.
	 */
	const cardQuery = useQuery({
		queryKey: ["payment-method", "mine", outletId ?? "none"],
		queryFn: () => fetchMyPaymentMethod(logout, outletId ?? undefined),
		enabled: backed,
		staleTime: 60_000,
	});

	const cardMut = useMutation({
		mutationFn: (input: SavePaymentMethodInput) =>
			saveMyPaymentMethod(input, logout),
		onSuccess: () => void cardQuery.refetch(),
	});

	/**
	 * Save the venue's card. `last4` and `brand` are derived in the CALLER from
	 * the number typed, which is discarded there — this only ever carries four
	 * digits, and the server rejects anything longer.
	 */
	const saveCard = async (
		input: Omit<SavePaymentMethodInput, "outletId">,
	): Promise<{ ok: boolean; reason?: string }> => {
		try {
			await cardMut.mutateAsync({
				...input,
				outletId: outletId && UUID_RE.test(outletId) ? outletId : undefined,
			});
			return { ok: true };
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			return { ok: false, reason: message };
		}
	};

	const removeMut = useMutation({
		mutationFn: (id: string) =>
			removeMyPaymentMethod(
				id,
				logout,
				outletId && UUID_RE.test(outletId) ? outletId : undefined,
			),
		onSuccess: () => void cardQuery.refetch(),
	});

	/**
	 * Retire the saved instrument — auto-debit off, the venue pays each period
	 * by FPX from then on. The server's sentence comes back either way so the
	 * screen shows what happened, not a guess.
	 */
	const removeCard = async (): Promise<{ ok: boolean; message?: string }> => {
		const id = cardQuery.data?.id;
		if (!id) return { ok: false };
		try {
			const message = await removeMut.mutateAsync(id);
			return { ok: true, message };
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			return { ok: false, message };
		}
	};

	/** Match a plan by name, case/space-insensitively ("Pro" -> the Pro row). */
	const findPlan = (label: string) =>
		outletPlans.find(
			(plan) => plan.name.trim().toLowerCase() === label.trim().toLowerCase(),
		) ?? null;

	/**
	 * This venue's own outstanding switch, straight from the server.
	 *
	 * It used to be React state only, so a refresh forgot that the venue had
	 * already asked — the switch buttons came back, the venue tapped again, and
	 * the admin queue filled with duplicate requests for one decision. Reading it
	 * back means the "awaiting admin" state survives a refresh and clears by
	 * itself the moment the admin approves or declines.
	 */
	const pendingQuery = useQuery({
		queryKey: ["admin-request", "mine", "plan-change"],
		queryFn: () => fetchMyPlanChange(logout),
		enabled: backed,
		staleTime: 15_000,
	});

	/** The plan name the venue is waiting on, or null when nothing is pending. */
	const pendingPlanLabel = useMemo<string | null>(() => {
		const requestedId = pendingQuery.data?.requestedPlanId;
		if (!requestedId) return null;
		return (
			(plansQuery.data?.data ?? []).find((plan) => plan.id === requestedId)
				?.name ?? null
		);
	}, [pendingQuery.data, plansQuery.data]);

	const planChangeMut = useMutation({
		mutationFn: (input: CreateAdminRequestInput) =>
			createAdminRequest(input, logout),
		// Re-read the server's answer so the badge reflects what was actually filed.
		onSuccess: () => void pendingQuery.refetch(),
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
	}): Promise<PlanChangeResult> => {
		if (!identity) return { ok: false };
		const target = findPlan(params.toPlanLabel);
		if (!target) {
			return {
				ok: false,
				reason: `${params.toPlanLabel} is not in the InnocenZ plan list — contact admin`,
			};
		}
		const from = params.fromPlanLabel ? findPlan(params.fromPlanLabel) : null;
		const email = params.contact?.email?.trim();
		try {
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
			return { ok: true };
		} catch (error) {
			// The server refuses for reasons the venue can act on ("Already on
			// Essential — no switch needed"). Swallowing that behind a generic
			// "try again" sent one venue round in circles, so pass it through.
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			// Its plan may have moved under us; re-read so the card is honest.
			void billingQuery.refetch();
			void pendingQuery.refetch();
			return { ok: false, reason: message };
		}
	};

	/**
	 * Ask to come OFF the POS add-on and go back to plan-only billing.
	 *
	 * Filed as the same POS request type but naming the venue's PLAN as the
	 * target — that is what tells the admin (and the resolve handler) this is an
	 * exit, ending the add-on line instead of starting another one. It lands in
	 * the same Plan Request inbox, so the admin who agreed the price sees it
	 * stop as well as start.
	 */
	const requestPosRemoval = async (): Promise<boolean> => {
		if (!identity) return false;
		const current = activePlanName ? findPlan(activePlanName) : null;
		if (!current) return false;
		await posQuoteMut.mutateAsync({
			type: "pos_integration_quote",
			subscriberType: "outlet",
			subscriberId: UUID_RE.test(identity.outletId)
				? identity.outletId
				: undefined,
			subscriberName: identity.outletName,
			requestedPlanId: current.id,
			message: `Requesting to remove POS integration and stay on ${current.name} only.`,
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
		/** Ended/cancelled subscriptions, behind a disclosure on the screen. */
		/** Billed periods with their paid/unpaid state — the real payment history. */
		paymentHistory,
		/**
		 * Which lane a billed period belongs to — 'plan', 'addon', or null when it
		 * cannot be resolved. A venue holding the POS add-on is billed on both
		 * lanes each month, and two rows for one month with no label reads as a
		 * double charge.
		 */
		invoiceLane,
		isPaymentHistoryLoading: invoicesQuery.isLoading,
		activePlanName,
		/** Real next billing date from the ledger; null when nothing is active. */
		nextRenewalDate,
		/** Each lane's current billing window, and the add-on's own renewal. */
		planWindow: laneDates.planWindow,
		addonWindow: laneDates.addonWindow,
		addonRenewalDate: laneDates.addonRenewalDate,
		/** True while a POS-integration quote is with the admin (server truth). */
		posQuotePending: Boolean(posQuoteQuery.data),
		/**
		 * WHICH POS request is open — a cancellation names the plan the venue is
		 * keeping, everything else is a quote or re-quote. The card blocks only the
		 * action already asked for, so a venue that asked for a new price can still
		 * change its mind and drop POS instead.
		 */
		posRequestKind: posQuoteQuery.data
			? posQuoteQuery.data.requestedPlanId
				? ("cancel" as const)
				: ("requote" as const)
			: null,
		/** Live POS add-on at the agreed price, once the admin has resolved it. */
		addonName: activeAddon?.planName ?? null,
		addonAmountRm: activeAddon ? Number(activeAddon.amount) : null,
		addonBillingCycle: activeAddon?.billingCycle ?? null,
		/** Plan awaiting admin approval — survives a refresh; null once answered. */
		pendingPlanLabel,
		/** The venue's saved card, or null when it has never saved one. */
		card: cardQuery.data ?? null,
		isCardLoading: cardQuery.isLoading,
		isSavingCard: cardMut.isPending,
		saveCard,
		isRemovingCard: removeMut.isPending,
		removeCard,
		isLoading: billingQuery.isLoading,
		isRequestingQuote: posQuoteMut.isPending,
		requestPosQuote,
		requestPosRemoval,
		/**
		 * Taking the outstanding POS request back. Real now — before this there was
		 * no withdraw endpoint at all, and the card cleared a local flag while the
		 * admin still held the request.
		 */
		withdrawPosRequest,
		isWithdrawingPos: withdrawPosMut.isPending,
		requestPlanChange,
		isRequestingPlanChange: planChangeMut.isPending,
		/** False until the catalog has loaded — the switch cannot be filed yet. */
		planCatalogReady: outletPlans.length > 0,
	};
}
