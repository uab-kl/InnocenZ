import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	addDaysToIso,
	getLiveTodayIso,
	getPayrollWeekSundayIso,
} from "@agency-portal/lib/demo-clock";
import {
	nextRenewalFrom,
	nextRenewalFromInvoices,
	planChangeRecordFromMember,
	type SubscriptionRecordRow,
	sortMemberSubscriptions,
	subscriptionRecordFromMember,
} from "@agency-portal/lib/subscription-record";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	type CreateAdminRequestInput,
	createAdminRequest,
	fetchMyCustomQuote,
	fetchMyPlanChange,
} from "@/services/admin-request";
import { fetchMemberSubscriptions } from "@/services/member-subscription";
import {
	fetchMyPaymentMethod,
	type SavePaymentMethodInput,
	saveMyPaymentMethod,
} from "@/services/payment-method";
import { fetchPaymentVouchers } from "@/services/payment-voucher";
import { fetchSubscriptions, type Subscription } from "@/services/subscription";
import {
	fetchSubscriptionInvoices,
	type SubscriptionInvoice,
} from "@/services/subscription-invoice";

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

function ratePlanFromBackend(
	sub: Subscription,
	t: PortalTranslations,
): AgencyRatePlan {
	const price = Number(sub.price);
	const hasPrice = Number.isFinite(price) && price > 0;
	const weekly = sub.billingCycle === "weekly";
	return {
		id: sub.id,
		label: sub.name,
		weeklyRm: weekly && hasPrice ? price : null,
		// Non-weekly or zero-price plans show a label instead of a /week amount.
		priceLabel: !hasPrice
			? t.subscription.priceRenegotiate
			: weekly
				? null
				: fill(t.subscription.pricePerCycle, {
						amount: price.toLocaleString(),
						// The backend's own cycle word; not a UI label, so it is
						// resolved rather than translated in place.
						cycle:
							sub.billingCycle === "weekly"
								? t.subscription.billedWeekly
								: t.subscription.billedMonthly,
					}),
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
	const { t } = usePortalLocale();
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
	 * What this agency is subscribed to RIGHT NOW — normally one row.
	 *
	 * Read off `memberQuery`, which is already scoped to this agency and to
	 * `status: "active"`. It used to have a query of its own that listed the whole
	 * ledger, and since every tier change ENDS one row and STARTS another, an
	 * agency that had moved tier a few times saw seven rows for one subscription:
	 * six of them ended or cancelled, none carrying any payment state (see the
	 * type's docstring), all of them reading like bills it still owed. That query
	 * also passed no `subscriberType`/`subscriberId`, so its page of 50 was
	 * whatever the endpoint returned rather than this agency's own rows.
	 */
	const billingHistory = useMemo<SubscriptionRecordRow[]>(
		() =>
			sortMemberSubscriptions(memberQuery.data?.data ?? []).map((sub) =>
				subscriptionRecordFromMember(sub, "InnocenZ Agency", t),
			),
		[memberQuery.data, t],
	);

	/**
	 * Everything this agency has been on and is no longer. Its own query, because
	 * `memberQuery` filters to `status: "active"` server-side and widening it
	 * would let a cancelled row become the current plan (it is consumed as
	 * `data[0]`). Scoped to THIS agency — the query this replaced passed neither
	 * `subscriberType` nor `subscriberId`.
	 */
	const historyQuery = useQuery({
		queryKey: ["agency", "subscription", "history", agencyId ?? "none"],
		queryFn: () =>
			fetchMemberSubscriptions(
				{
					subscriberType: "agency",
					subscriberId: agencyId as string,
					pageSize: 50,
				},
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	/**
	 * What this agency has actually been BILLED, week by week — the billing
	 * ledger, not the subscription ledger.
	 *
	 * Agencies bill WEEKLY (Sun–Sat, the same payroll week the rest of the app
	 * uses); outlets bill monthly. Both read the same endpoint, which scopes to
	 * the caller's own org server-side.
	 */
	const invoicesQuery = useQuery({
		queryKey: ["subscription-invoice", "agency", agencyId ?? "none"],
		queryFn: () => fetchSubscriptionInvoices({ pageSize: 60 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const paymentHistory = useMemo<SubscriptionInvoice[]>(
		() => invoicesQuery.data?.data ?? [],
		[invoicesQuery.data],
	);

	const pastSubscriptions = useMemo<SubscriptionRecordRow[]>(
		() =>
			sortMemberSubscriptions(historyQuery.data?.data ?? [])
				.filter((sub) => sub.status !== "active")
				.map((sub) => planChangeRecordFromMember(sub, "InnocenZ Agency", t)),
		[historyQuery.data, t],
	);

	const plans = useMemo<AgencyRatePlan[]>(
		() =>
			(plansQuery.data?.data ?? [])
				.filter((sub) => sub.subscriptionType === "agency")
				.map((sub) => ratePlanFromBackend(sub, t))
				.sort(compareAgencyRatePlans),
		// `t` is a dep: without it the rate card would keep whichever language was
		// active when the memo last ran, so switching language left the prices behind.
		[plansQuery.data, t],
	);

	const current = useMemo(
		() => memberQuery.data?.data?.[0] ?? null,
		[memberQuery.data],
	);

	/**
	 * When this agency is next charged — its subscription start rolled forward by
	 * the billing cycle. Same rule as the outlet's, from one place: the screen
	 * used to print a demo-clock date that had nothing to do with the ledger.
	 */
	const nextRenewalDate = useMemo<Date | null>(
		// The billing calendar wins — an agency holds one lane, so every period
		// invoice is the plan's. The start-date rule is only the fallback for an
		// agency with no week opened yet.
		() =>
			nextRenewalFromInvoices(paymentHistory) ??
			nextRenewalFrom(current?.startedAt, current?.billingCycle),
		[current, paymentHistory],
	);

	/**
	 * The agency's saved card. The screen printed a hardcoded "Visa ···· 4242"
	 * whose Update button only raised a toast — a card nobody owns, that nothing
	 * could ever be billed to.
	 */
	const cardQuery = useQuery({
		queryKey: ["payment-method", "mine", agencyId ?? "none"],
		queryFn: () => fetchMyPaymentMethod(logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const cardMut = useMutation({
		mutationFn: (input: SavePaymentMethodInput) =>
			saveMyPaymentMethod(input, logout),
		onSuccess: () => void cardQuery.refetch(),
	});

	/**
	 * Save the agency's card. No `outletId`: an agency session resolves to its own
	 * agency server-side, and passing one would be meaningless here.
	 */
	const saveCard = async (
		input: Omit<SavePaymentMethodInput, "outletId">,
	): Promise<{ ok: boolean; reason?: string }> => {
		try {
			await cardMut.mutateAsync(input);
			return { ok: true };
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			return { ok: false, reason: message };
		}
	};

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

	/**
	 * PVs this agency issued in the current payroll week, from the REAL vouchers.
	 *
	 * The tier is not a choice — it follows this number — so it has to come from
	 * the ledger of vouchers, not from the demo store's PV list, which is empty
	 * for a real agency and would read as "0 PV" for everyone. Null while the
	 * count is unknown (loading, or a demo session), which is what stops the
	 * caller acting on a number it does not have yet.
	 */
	const vouchersQuery = useQuery({
		queryKey: ["agency", "subscription", "weekly-pv"],
		queryFn: () => fetchPaymentVouchers({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const weeklyPvCount = useMemo<number | null>(() => {
		if (!backed || vouchersQuery.isLoading || !vouchersQuery.data) return null;
		const weekStart = getPayrollWeekSundayIso(getLiveTodayIso());
		const weekEnd = addDaysToIso(weekStart, 6);
		return vouchersQuery.data.data.filter((pv) => {
			// Prefer the voucher's own payroll week; fall back to when it was
			// issued, since a voucher without a week still belongs to one.
			const day = (pv.weekStart ?? pv.issuedDate ?? "").slice(0, 10);
			return day >= weekStart && day <= weekEnd;
		}).length;
	}, [backed, vouchersQuery.isLoading, vouchersQuery.data]);

	/**
	 * The SETTLED payroll week's count — the week that has finished.
	 *
	 * Distinct from `weeklyPvCount` above, which counts the week still running,
	 * and the difference is not cosmetic. The tier an agency is billed on is
	 * decided by the Sunday 03:30 job against a week that has CLOSED, so the card
	 * explaining that price ("you issued N last week, which is what puts you
	 * here") has to count the same week the price was computed from. Printing the
	 * running week's count under that sentence shows a number that cannot explain
	 * the tier beside it — worst on a Monday, when the running week is nearly
	 * always 0.
	 *
	 * Same query, so this costs no extra request: the vouchers are already here.
	 */
	const settledWeeklyPvCount = useMemo<number | null>(() => {
		if (!backed || vouchersQuery.isLoading || !vouchersQuery.data) return null;
		const weekStart = addDaysToIso(
			getPayrollWeekSundayIso(getLiveTodayIso()),
			-7,
		);
		const weekEnd = addDaysToIso(weekStart, 6);
		return vouchersQuery.data.data.filter((pv) => {
			const day = (pv.weekStart ?? pv.issuedDate ?? "").slice(0, 10);
			return day >= weekStart && day <= weekEnd;
		}).length;
	}, [backed, vouchersQuery.isLoading, vouchersQuery.data]);

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

	/**
	 * WHICH Custom request is open — naming an ordinary tier is an exit, anything
	 * else is a quote or re-quote. Only that action is blocked: an agency that
	 * asked for a new price must still be able to decide it would rather leave
	 * Custom, the same way a venue can change its mind about POS.
	 */
	const customRequestKind = useMemo<"requote" | "exit" | null>(() => {
		const open = customQuery.data;
		if (!open) return null;
		const requested = open.requestedPlanId
			? (planNameById.get(open.requestedPlanId) ?? null)
			: null;
		return requested && requested !== CUSTOM ? "exit" : "requote";
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
	 * Move this agency onto the tier its PV volume implies.
	 *
	 * An agency does NOT choose its tier — the rate card is a band table and the
	 * week’s PV count picks the row. So this is driven by the volume rule, never
	 * by a button, and is filed as a `plan_change`, which the server applies
	 * straight away ('direct'): every banded tier has a list price, so there is
	 * nothing for an admin to decide.
	 */
	const applyAutoTier = async (
		toPlanLabel: string,
		weeklyPv: number,
	): Promise<AgencyPlanChangeResult> => {
		const target = findPlan(toPlanLabel);
		if (!target) {
			return {
				ok: false,
				reason: `${toPlanLabel} is not in the InnocenZ agency plan list — contact admin`,
			};
		}
		return fileRequest({
			type: "plan_change",
			currentPlanId: current?.subscriptionId ?? undefined,
			requestedPlanId: target.id,
			message: `Auto-tier: ${weeklyPv} PV issued this payroll week puts this agency on ${target.name} (RM ${target.price} / ${target.billingCycle}).`,
		});
	};

	/**
	 * Tell the admin this agency needs a Custom price — the 151+ PV band has no
	 * list price, so there is nothing to auto-apply and the tier cannot move until
	 * a human agrees a figure.
	 *
	 * Filed as `custom_renegotiation` (pending), never a plan_change: a plan_change
	 * is applied on the spot, which would put the agency on Custom at its RM 0
	 * catalog placeholder. That is exactly how Atlas ended up billing nothing.
	 */
	const notifyAdminForCustom = async (
		weeklyPv: number,
	): Promise<AgencyPlanChangeResult> => {
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
			message: onCustom
				? `Requesting a new Custom price — ${weeklyPv} PV issued this payroll week.`
				: `${weeklyPv} PV issued this payroll week is past the 150 PV rate card. Requesting a Custom price.`,
		});
	};

	/**
	 * Ask to come off Custom, back onto the banded rate card.
	 *
	 * A REQUEST, and it changes nothing until the admin answers — the agency
	 * stays on Custom at the agreed price meanwhile. Ending a negotiated price is
	 * not the agency's to do alone: two people agreed that figure.
	 *
	 * Filed as `custom_renegotiation` NAMING THE TIER it wants, which is what
	 * marks it an exit rather than a re-price — the exact mirror of a venue
	 * asking to drop POS. It used to be a `plan_change`, which the server applies
	 * on the spot for an agency ('direct'): the reset took effect the instant it
	 * was tapped, so the admin's only option in Plan Request was to Resolve a
	 * move that had already happened, and there was nothing left to refuse.
	 *
	 * The resolve handler already knows this shape (a Custom request naming a
	 * plan → move the ledger); declining it leaves Custom exactly as it was.
	 */
	const requestLeaveCustom = async (
		toPlanLabel: string,
		weeklyPv: number,
	): Promise<AgencyPlanChangeResult> => {
		const target = findPlan(toPlanLabel);
		if (!target) {
			return { ok: false, reason: `${toPlanLabel} is not in the plan list` };
		}
		return fileRequest({
			type: "custom_renegotiation",
			currentPlanId: current?.subscriptionId ?? undefined,
			requestedPlanId: target.id,
			message: `Requesting to leave Custom for ${target.name} — ${weeklyPv} PV issued this payroll week (RM ${target.price} / ${target.billingCycle}).`,
		});
	};

	return {
		backed,
		plans,
		billingHistory,
		currentSubscriptionId: current?.subscriptionId ?? null,
		currentPlanName: current?.planName ?? null,
		/** Real next charge date from the ledger; null when nothing is active. */
		nextRenewalDate,
		/** The agency's saved card, or null when it has never saved one. */
		card: cardQuery.data ?? null,
		isCardLoading: cardQuery.isLoading,
		isSavingCard: cardMut.isPending,
		saveCard,
		/** Real amount billed for the current tier; null when nothing is active. */
		currentAmountRm: current ? Number(current.amount) : null,
		onCustom,
		customAmountRm,
		/** Tier awaiting admin approval — survives a refresh; null once answered. */
		pendingPlanLabel,
		/** True while a Custom price request is with the admin (server truth). */
		customRequestPending: Boolean(customQuery.data),
		customRequestLabel,
		customRequestKind,
		/**
		 * PVs issued this payroll week, from the real vouchers. Null while unknown
		 * — the volume rule must not act on a number it does not have.
		 */
		weeklyPvCount,
		/**
		 * PVs issued in the payroll week that has CLOSED — the week the billed tier
		 * was actually computed from. Null while unknown. This is what the hero
		 * card prints; `weeklyPvCount` above is the running week and drives the
		 * live tier rule.
		 */
		settledWeeklyPvCount,
		applyAutoTier,
		notifyAdminForCustom,
		requestLeaveCustom,
		isRequesting: requestMut.isPending,
		/** False until the catalog has loaded — no switch can be filed yet. */
		planCatalogReady: plans.length > 0,
		isLoading: plansQuery.isLoading || memberQuery.isLoading,
		isHistoryLoading: memberQuery.isLoading,
		/** Ended/cancelled plans, behind a disclosure on the screen. */
		pastSubscriptions,
		/** Billed weeks with their paid/unpaid state — the real payment history. */
		paymentHistory,
		isPaymentHistoryLoading: invoicesQuery.isLoading,
	};
}
