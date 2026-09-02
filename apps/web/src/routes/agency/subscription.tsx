import { PaymentMethodCard } from "@agency-portal/components/iz/PaymentMethodCard";
import {
	PastSubscriptionsDisclosure,
	PaymentHistoryList,
	SubscriptionRecordCard,
} from "@agency-portal/components/iz/SubscriptionRecordList";
import {
	formatRM,
	IzCard,
	IzPageTitle,
	IzPill,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useAgencyCollections } from "@agency-portal/hooks/use-agency-collections";
import {
	type AgencyRatePlan,
	useAgencySubscription,
} from "@agency-portal/hooks/use-agency-subscription";
import {
	AGENCY_SUBSCRIPTION_PLANS,
	agencySubscriptionBillingForWeeklyPv,
	agencyWeeklyPvCount,
	resolveAgencySubscriptionPlanForWeeklyPv,
	scopeToAgency,
} from "@agency-portal/lib/agency-demo";
import { getAgencyManagedPvs } from "@agency-portal/lib/agency-payroll";
import {
	COLLECTION_AGING_PILL,
	collectionAmountRm,
	collectionStampLabel,
	collectionWeekLabel,
} from "@agency-portal/lib/collections";
import { getPreviousWeekSundayIso } from "@agency-portal/lib/demo-clock";
import {
	demoPayrollWeekBoundsForWeeksAgo,
	demoPvIssueIsoForWeeksAgo,
} from "@agency-portal/lib/pr-demo";
import { useStore } from "@agency-portal/lib/store";
import type { SubscriptionRecordRow } from "@agency-portal/lib/subscription-record";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
	Building2,
	Calendar,
	Receipt,
	RotateCcw,
	Sparkles,
	TriangleAlert,
	Users,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import {
	planCapacityLabel,
	planDescription,
} from "@/lib/portal-i18n/plan-label";
import {
	describePaymentMethod,
	willAutoCharge,
} from "@/services/payment-method";

const CARD_LAST4 = "4242";

/**
 * Collections (what outlets owe this agency for PR work) is HIDDEN — owner,
 * 12 Aug 2026.
 *
 * Gated rather than deleted, because the section is not broken: since the
 * weekly job stopped drafting `collection_invoice` rows that same day, and no
 * API can create one, it can only ever show frozen history beside an empty
 * Drafts list whose Issue button is unreachable. The table, the hook and the
 * markup stay so that turning this back on is one line if outlet↔agency billing
 * ever comes back into the app.
 */
const SHOW_COLLECTIONS = false;

export const Route = createFileRoute("/agency/subscription")({
	component: AgencySubscription,
});

function AgencySubscription() {
	const { t, locale } = usePortalLocale();
	const agencyOwner = useStore((s) => s.agencyOwner);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencyPRs = useMemo(
		() => scopeToAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const prPaymentVouchers = useStore((s) => s.prPaymentVouchers ?? []);
	const allAgencyCollections = useStore((s) => s.agencyCollections);
	const agencyCollections = useMemo(
		() => scopeToAgency(allAgencyCollections, activeAgencyId),
		[allAgencyCollections, activeAgencyId],
	);
	const saveAgencyOwner = useStore((s) => s.saveAgencyOwner);
	const toast = useStore((s) => s.toast);
	const can = useAgencyCan();
	const canEdit = can("editSettings");

	const payrollWeekStartIso = getPreviousWeekSundayIso();
	const payrollWeek = demoPayrollWeekBoundsForWeeksAgo(0);
	const nextChargeDate = format(
		parseISO(demoPvIssueIsoForWeeksAgo(0)),
		"d MMM yyyy",
	);
	const issuedWeeklyPv = useMemo(
		() =>
			agencyWeeklyPvCount(
				getAgencyManagedPvs(prPaymentVouchers, agencyPRs),
				payrollWeekStartIso,
			),
		[prPaymentVouchers, agencyPRs, payrollWeekStartIso],
	);
	const billing = useMemo(
		() => agencySubscriptionBillingForWeeklyPv(issuedWeeklyPv, t),
		// `t` is load-bearing: without it the billing line keeps the language it
		// was first computed in until the PV count happens to change.
		[issuedWeeklyPv, t],
	);

	// Real login → rate card lists real backend plans; demo plans otherwise.
	const sub = useAgencySubscription();

	/**
	 * THE NUMBER THE HERO CARD PRINTS. Real vouchers on a real login.
	 *
	 * `issuedWeeklyPv` above is computed from the browser demo store, which is
	 * BLANKED on every real session — so a live agency read "0 PVs issued" sitting
	 * directly beside a tier and a price chosen from a real, different count. That
	 * is worse than showing nothing: it invites an agency to dispute a correct
	 * invoice using a number the app made up.
	 *
	 * Deliberately a SEPARATE value rather than a fix to `issuedWeeklyPv` itself.
	 * That one still feeds `billing`, which feeds the demo store write at the top
	 * of this component; re-pointing it would move demo bookkeeping as a
	 * side-effect of a display fix. Only what the card SHOWS changes here.
	 *
	 * Null while the vouchers are still loading — rendered as a dash, never as 0,
	 * because 0 is itself a real and meaningful answer on this card.
	 */
	const heroPvCount: number | null = sub.backed
		? sub.settledWeeklyPvCount
		: issuedWeeklyPv;

	// Receivables owed BY outlets — the opposite direction to everything else on
	// this screen. Backed sessions only: the demo store's `kind: "outlet"` rows
	// were never rendered anywhere, so there is no demo experience to preserve,
	// and Issue / Mark-settled buttons that persist nothing would be worse than
	// no section at all.
	const collections = useAgencyCollections();
	const ratePlans = useMemo<AgencyRatePlan[]>(
		() =>
			sub.backed
				? sub.plans
				: AGENCY_SUBSCRIPTION_PLANS.map((p) => ({
						id: p.id,
						label: p.label,
						weeklyRm: p.weeklyRm ?? null,
						priceLabel: p.priceLabel ?? null,
						capacityLabel: p.capacityLabel,
						description: p.description,
					})),
		[sub.backed, sub.plans],
	);

	useEffect(() => {
		if (agencyOwner.subscriptionPlanId !== billing.plan.id) {
			saveAgencyOwner({ subscriptionPlanId: billing.plan.id });
		}
	}, [agencyOwner.subscriptionPlanId, billing.plan.id, saveAgencyOwner]);

	/**
	 * What this agency owes InnocenZ. Real sessions read the
	 * `member_subscription` ledger; demo sessions keep the store's
	 * `kind: "agency"` invoices, mapped onto the same row shape so the render
	 * below has one branch rather than two.
	 *
	 * The demo rows and the backend rows are NOT the same kind of record — see
	 * the note under the section heading — so this is the one place that
	 * difference is reconciled, deliberately and in the open.
	 */
	const billingHistory = useMemo<SubscriptionRecordRow[]>(() => {
		if (sub.backed) return sub.billingHistory;
		return agencyCollections
			.filter(
				(c) =>
					c.kind === "agency" &&
					(c.lines ?? []).some((line) =>
						line.label.toLowerCase().includes("subscription"),
					),
			)
			.map((c) => ({
				id: c.id,
				title: c.lines?.[0]?.label ?? c.id,
				detail: c.lines?.[0]?.detail ?? "",
				dateLabel: c.issueDate,
				amountRm: c.amount,
				// The comparison stays on the STORED "SETTLED"; only the label the
				// card prints is resolved. Any other status falls through to the raw
				// value rather than blanking the pill.
				statusLabel:
					c.status === "SETTLED" ? t.subscription.statusPaid : c.status,
				tone: c.status === "SETTLED" ? "green" : "amber",
			}));
		// `t` is read above, so it belongs here: without it these rows keep the
		// wording from whichever language was active when the memo last ran.
	}, [sub.backed, sub.billingHistory, agencyCollections, t]);

	/**
	 * What this agency has asked InnocenZ for and not been answered on yet — the
	 * agency's half of the same handshake the outlet has for its POS add-on.
	 * Ordinary tier switches never appear here: the server applies those on the
	 * spot ('direct'), so there is nothing to wait for. Only Custom waits.
	 */
	const waitingOn = sub.backed
		? (sub.customRequestLabel ?? sub.pendingPlanLabel)
		: null;

	/**
	 * The volume rule, and the only thing that moves this agency's tier.
	 *
	 * An agency does NOT pick a plan — the rate card is a band table and the PVs
	 * it issued this payroll week choose the row. So there are no switch buttons;
	 * this effect reconciles what the ledger says with what the volume says:
	 *
	 *  • inside the rate card, on the wrong tier → apply the right one (list
	 *    price, applied on the spot, nothing for an admin to decide)
	 *  • past 150 PV → NOTIFY THE ADMIN to negotiate, because the 151+ band has
	 *    no list price. The agency stays on its current tier until they answer.
	 *  • already on Custom → NOTHING. A negotiated price is not the volume rule's
	 *    to undo; leaving Custom is the agency pressing Reset, or the admin.
	 *
	 * Guarded hard, because this WRITES: only for a real session, only once the
	 * real PV count and the plan catalog have loaded, never while a request is
	 * already open, and at most once per mount.
	 */
	const autoTierFiled = useRef(false);
	/*
	 * `t` is read here (for the toast) but deliberately NOT a dependency, so the
	 * ignore below is the point rather than a silencer. This effect WRITES —
	 * it files a Custom-price request with the admin. Re-running it because the
	 * reader switched language would be a real fault, and the guard that makes
	 * it at-most-once (`autoTierFiled`) is a ref, so it would not stop a re-run
	 * on a fresh mount. The toast wording resolving one language late is the
	 * cheaper of the two.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above — `t` must not re-trigger a write
	useEffect(() => {
		if (!sub.backed || !canEdit) return;
		if (sub.weeklyPvCount === null || !sub.planCatalogReady) return;
		if (sub.isLoading || sub.isRequesting) return;
		if (waitingOn || autoTierFiled.current) return;

		const pv = sub.weeklyPvCount;
		const banded = resolveAgencySubscriptionPlanForWeeklyPv(pv);
		const needsCustom = Boolean(banded.renegotiate);

		if (needsCustom && !sub.onCustom) {
			autoTierFiled.current = true;
			sub.notifyAdminForCustom(pv).then((r) => {
				toast(
					r.ok
						? fill(t.subscription.pvThisWeekNegotiate, { n: pv })
						: (r.reason ?? t.subscription.couldNotNotifyAdmin),
					r.ok ? "success" : "warn",
				);
			});
			return;
		}

		/*
		 * ⚠️ NOTHING AUTOMATIC EVER TAKES AN AGENCY OFF CUSTOM. There used to be a
		 * branch here that reset a Custom agency the moment its weekly PV count sat
		 * inside the rate card, and it destroyed the admin's work: a price agreed at
		 * 17:46 was reset at 17:47, then re-quoted and reset again, four times over.
		 *
		 * A Custom price is a negotiated agreement between two people. Volume is
		 * evidence about it, not authority over it — least of all a 0-PV week, which
		 * is what an agency reads as before its first voucher is issued. Leaving
		 * Custom is a deliberate act: the agency presses Reset, or the admin ends it.
		 */
		if (
			!needsCustom &&
			!sub.onCustom &&
			sub.currentPlanName &&
			sub.currentPlanName !== banded.label
		) {
			autoTierFiled.current = true;
			sub.applyAutoTier(banded.label, pv).then((r) => {
				if (r.ok) {
					toast(
						fill(t.subscription.pvThisWeekTierNow, {
							n: pv,
							plan: banded.label,
						}),
						"success",
					);
				}
			});
		}
	}, [sub, canEdit, waitingOn, toast]);

	if (!can("viewSettings")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.managePr.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">{t.subscription.noAccess}</p>
				</IzCard>
			</div>
		);
	}

	const isFinanceReadOnly = agencySubRole === "agency_finance";
	const renewalDate = nextChargeDate;

	/**
	 * A real session is billed for the tier in its `member_subscription` row, not
	 * the one this week's PV count implies. Showing the derived tier told an
	 * agency on Custom that it was on Starter — the same mistake that had one
	 * venue displaying another venue's plan.
	 */
	const billedTierLabel = sub.backed
		? (sub.currentPlanName ?? billing.plan.label)
		: billing.plan.label;
	/**
	 * The real next charge, from this agency's own subscription row. The demo
	 * clock's date sat beside it and disagreed — the screen showed "2 Aug 2026"
	 * for an agency whose week rolls from its actual start date.
	 *
	 * The tag comes from the portal's language, not a hardcoded `en-GB`: this is
	 * a rendered label with nothing downstream parsing it. English still gets
	 * `en-GB`, so day-before-month ordering is unchanged.
	 */
	const realRenewalLabel = sub.nextRenewalDate
		? sub.nextRenewalDate.toLocaleDateString(dateLocaleTag(locale), {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: null;

	const billedPriceLabel = sub.backed
		? sub.currentAmountRm
			? formatRM(sub.currentAmountRm)
			: sub.onCustom
				? t.subscription.awaitingPrice
				: billing.priceLabel
		: billing.priceLabel;

	/**
	 * The coverage of the tier this agency IS ON — read from the same place as
	 * the pill and the price beside it.
	 *
	 * It used to print `billing.plan.capacityLabel`, which is the band the week's
	 * PV COUNT falls into, not the band the agency holds. An agency on Custom
	 * that had issued 0 PVs therefore read "Custom … 5 PV/Week" — the Starter
	 * band's coverage under a Custom pill, contradicting the sentence beside it
	 * that says PV volume does not price Custom at all.
	 *
	 * On Custom there is no band to quote: the price is negotiated, so coverage
	 * is not what it buys. Every other tier takes its real catalog coverage.
	 */
	const billedCapacityLabel = sub.backed
		? sub.onCustom
			? t.subscription.pricedPerAgency
			: (sub.plans.find((plan) => plan.label === sub.currentPlanName)
					?.capacityLabel ?? billing.plan.capacityLabel)
		: billing.plan.capacityLabel;

	/**
	 * Leave Custom and go back to the banded rate card.
	 *
	 * The ONLY thing an agency can do to its own tier by hand. It is still a
	 * REQUEST — the admin resolving it is what moves the ledger — because an
	 * agency must not be able to end a price a human negotiated. Re-negotiating
	 * is not offered here at all: that is the volume rule's job when the week's
	 * PVs go past the rate card.
	 */
	/**
	 * Ask the admin to price Custom before the volume rule would.
	 *
	 * The rule fires at 151 PV in a settled payroll week, which is the right
	 * trigger for billing but a poor one for an agency that has just signed a
	 * client it cannot serve inside the rate card. Same request either way — the
	 * admin sets the price and nothing bills until they do.
	 */
	const handleAskForCustom = () => {
		/**
		 * THE OWNER'S RULE for the agency's one manual ask: unpaid → no Custom
		 * negotiation — popped here, before a request that would just sit in the
		 * admin's queue is composed. Resetting OFF Custom is deliberately NOT
		 * gated (owner: "for agency reset any time if custom only") — dropping
		 * cost must never be blocked by debt. The Sunday auto-tier and the
		 * past-rate-card auto-file are untouched: those are the system's own
		 * acts, not this button.
		 */
		const owing = sub.paymentHistory.filter((row) => row.status !== "paid");
		if (owing.length > 0) {
			const cents = owing.reduce(
				(total, row) => total + Math.round(Number(row.amount) * 100),
				0,
			);
			toast(
				fill(t.subscription.settleBeforeCustomAsk, {
					amount: formatRM(cents / 100),
					n: owing.length,
				}),
				"warn",
			);
			return;
		}
		const pv = sub.weeklyPvCount ?? 0;
		sub.notifyAdminForCustom(pv).then((result) => {
			toast(
				result.ok
					? t.subscription.adminNotifiedWillQuote
					: (result.reason ?? t.subscription.couldNotNotifyAdmin),
				result.ok ? "success" : "warn",
			);
		});
	};

	const handleResetToNormal = () => {
		const pv = sub.weeklyPvCount ?? 0;
		const banded = resolveAgencySubscriptionPlanForWeeklyPv(pv);
		sub.requestLeaveCustom(banded.label, pv).then((result) => {
			toast(
				result.ok
					? fill(t.subscription.resetRequestedToast, { plan: banded.label })
					: (result.reason ?? t.subscription.couldNotSendRequest),
				result.ok ? "success" : "warn",
			);
		});
	};

	// Not `editSettings`: finance is read-only for the card above but is exactly
	// the role that chases receivables, and it holds both of these.
	const showCollections =
		SHOW_COLLECTIONS && collections.backed && can("viewCollections");
	const canManageCollections = can("confirmReconciliation");

	// Reports the server's own message. Settling says it records the agency's
	// claim rather than verifying payment, and a friendlier client-side string
	// would overstate what the app actually saw.
	//
	// `handleIssue` went with the Issue button — the drafts it acted on can no
	// longer exist. `collections.issue` stays in the hook and `/:id/issue` stays
	// on the server, so re-enabling drafting brings the action back whole.
	const handleSettle = async (id: string, outletName: string) => {
		try {
			const res = await collections.settle(id);
			toast(
				res.message ||
					fill(t.subscription.markedSettled, { outlet: outletName }),
				"success",
			);
		} catch {
			toast(
				fill(t.subscription.couldNotUpdateInvoice, { outlet: outletName }),
				"warn",
			);
		}
	};

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>{t.agencyMisc.subscription}</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">{agencyOwner.orgName}</p>
				{isFinanceReadOnly && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						{t.subscription.financeReadOnly}
					</p>
				)}
			</header>

			<IzSectionLabel>{t.agencyMisc.usageBasedWeekly}</IzSectionLabel>
			<IzCard className="border-[rgba(57,217,138,.35)] bg-[rgba(57,217,138,.06)]">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="iz-tiny iz-muted2">
							{fill(t.subscription.lastPayrollWeek, {
								cycle: payrollWeek.cycle,
							})}
						</p>
						<p className="mt-1 font-sora text-base font-bold">
							{heroPvCount === null
								? t.subscription.loadingCard
								: fill(
										heroPvCount === 1
											? t.subscription.pvIssuedOne
											: t.subscription.pvIssuedMany,
										{ n: heroPvCount },
									)}
						</p>
						<p className="iz-tiny iz-muted mt-1">
							{sub.backed && sub.onCustom
								? t.subscription.customPricedByAdmin
								: t.subscription.tierAutoSelected}
						</p>
					</div>
					<div className="text-right shrink-0">
						<IzPill variant="green">{billedTierLabel}</IzPill>
						<p className="mt-2 text-lg font-bold text-[var(--iz-gold-l)]">
							{billedPriceLabel}
						</p>
						<p className="iz-tiny iz-muted2 mt-0.5">{billedCapacityLabel}</p>
					</div>
				</div>
				<p className="iz-tiny iz-muted2 mt-3 border-t border-[var(--iz-line)] pt-2">
					{fill(t.subscription.nextWeeklyCharge, { date: renewalDate })}
					{sub.backed && sub.onCustom
						? t.subscription.atAgreedPrice
						: billing.plan.renegotiate
							? t.agencyMisc.contactAdminCustomPricing
							: heroPvCount === null
								? ""
								: fill(
										heroPvCount === 1
											? t.subscription.basedOnPvOne
											: t.subscription.basedOnPvMany,
										{ price: billedPriceLabel, n: heroPvCount },
									)}
				</p>
			</IzCard>

			{/*
			 * Custom is the agency's negotiated arrangement — the counterpart to the
			 * outlet's POS add-on, and handled the same way: InnocenZ admin sets the
			 * price, the agency can ask for it to be quoted again, and it stands
			 * until the admin answers. The difference is that Custom REPLACES the
			 * tier price rather than being billed on top of it.
			 */}
			{sub.backed && sub.onCustom && (
				<>
					<IzSectionLabel>{t.agencyMisc.negotiatedTier}</IzSectionLabel>
					<IzCard className="border-[rgba(139,124,246,.35)] bg-[rgba(139,124,246,.06)]">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-sora text-base font-bold">
										{t.agencyMisc.custom}
									</p>
									<IzPill variant="violet">{t.agencyMisc.negotiated}</IzPill>
									{/* Amber, and alongside — an agency on Custom with an open
									    request is in both states at once. */}
									{waitingOn && (
										<IzPill variant="amber">
											{sub.customRequestKind === "exit"
												? t.subscription.resetPendingAdmin
												: t.subscription.pricePendingAdmin}
										</IzPill>
									)}
								</div>
								<p className="iz-tiny iz-muted mt-1">
									{t.subscription.pricedForYourAgency}
								</p>
							</div>
							<p className="shrink-0 text-lg font-bold text-[var(--iz-gold-l)]">
								{sub.customAmountRm
									? formatRM(sub.customAmountRm)
									: t.subscription.awaitingPrice}
							</p>
						</div>
						{canEdit && (
							<>
								{waitingOn && (
									<p className="iz-tiny iz-muted mt-3 border-t border-[var(--iz-line)] pt-2">
										{sub.customRequestKind === "exit"
											? t.subscription.resetPending
											: t.subscription.pricePending}
									</p>
								)}
								{/*
								 * TWO ways to change a negotiated tier, and they are not the
								 * same act. RENEGOTIATE asks for a different figure; RESET asks
								 * to leave Custom for the banded tier the agency's PV volume
								 * implies. NEITHER changes anything until the admin answers —
								 * both end a price two people agreed, so both are the admin's to
								 * resolve or cancel. Nothing automatic does either.
								 *
								 * Only the action already asked for is blocked: an agency that
								 * asked for a new price must still be able to decide it would
								 * rather leave, exactly as a venue can with POS.
								 */}
								<div className="mt-3 grid gap-2 border-t border-[var(--iz-line)] pt-3 sm:grid-cols-2">
									<div>
										<button
											type="button"
											className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(139,124,246,.4)] bg-[rgba(139,124,246,.1)] px-3 py-2 transition-colors hover:bg-[rgba(139,124,246,.18)] disabled:opacity-60"
											disabled={
												sub.isRequesting || sub.customRequestKind === "requote"
											}
											onClick={handleAskForCustom}
										>
											<Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--iz-violet-l)]" />
											<span className="iz-tiny font-semibold text-[var(--iz-violet-l)]">
												{sub.customRequestKind === "requote"
													? t.subscription.renegotiating
													: t.subscription.renegotiatePrice}
											</span>
										</button>
										<p className="iz-tiny iz-muted2 mt-1.5">
											{t.subscription.askForDifferentFigure}
										</p>
									</div>
									<div>
										<button
											type="button"
											className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,.03)] px-3 py-2 transition-colors hover:bg-[rgba(255,255,255,.07)] disabled:opacity-60"
											disabled={
												sub.isRequesting || sub.customRequestKind === "exit"
											}
											onClick={handleResetToNormal}
										>
											<RotateCcw className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)]" />
											<span className="iz-tiny font-semibold">
												{sub.customRequestKind === "exit"
													? t.subscription.resetRequesting
													: t.subscription.resetToNormal}
											</span>
										</button>
										<p className="iz-tiny iz-muted2 mt-1.5">
											{t.subscription.asksToLeaveCustom}
										</p>
									</div>
								</div>
							</>
						)}
					</IzCard>
				</>
			)}

			<IzSectionLabel>{t.agencyMisc.rateCard}</IzSectionLabel>
			<p className="iz-tiny iz-muted2 -mt-1 mb-2">
				{sub.backed
					? t.subscription.tierChosenByPv
					: t.subscription.referenceTiers}
			</p>
			<div className="grid grid-cols-2 gap-2">
				{ratePlans.map((plan) => {
					const isBilledTier = sub.backed
						? sub.currentSubscriptionId
							? plan.id === sub.currentSubscriptionId
							: plan.label.toLowerCase() === billing.plan.label.toLowerCase()
						: plan.id === billing.plan.id;
					const priceDisplay =
						plan.priceLabel ??
						(plan.weeklyRm != null
							? formatRM(plan.weeklyRm)
							: t.subscription.priceRenegotiate);
					return (
						<IzCard
							key={plan.id}
							className={
								isBilledTier
									? "border-[rgba(57,217,138,.35)] bg-[rgba(57,217,138,.06)]"
									: undefined
							}
						>
							<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-sora text-sm font-bold">{plan.label}</p>
										{isBilledTier && (
											<IzPill variant="green">{t.agencyMisc.yourTier}</IzPill>
										)}
									</div>
									<p className="mt-1 text-lg font-bold text-[var(--iz-gold-l)]">
										{priceDisplay}
										{!plan.priceLabel && plan.weeklyRm != null && (
											<span className="iz-tiny iz-muted font-normal">
												{t.subscription.perWeek}
											</span>
										)}
									</p>
								</div>
								<div className="shrink-0 sm:text-right">
									<div className="flex items-center gap-1.5 text-[var(--iz-txt)] sm:justify-end">
										<Users className="h-4 w-4 text-[var(--iz-gold)]" />
										<span className="font-sora text-sm font-bold">
											{planCapacityLabel(
												"agency",
												plan.id,
												plan.capacityLabel,
												t,
											)}
										</span>
									</div>
								</div>
							</div>
							<p className="iz-tiny iz-muted mt-2">
								{planDescription("agency", plan.id, plan.description, t)}
							</p>
							{/*
							 * The ONE actionable tile on an otherwise read-only rate card.
							 * Custom is the only band with no list price, so it is the only
							 * one a human has to be involved in — and an agency that knows
							 * its volume is about to pass 150 should not have to wait for the
							 * week to prove it. Every other tier is chosen by PV count alone,
							 * which is why no other tile has a button.
							 */}
							{/* Compared against the LITERAL "Custom", not the translated word:
							    `plan.label` is the plan's name as the backend sends it, so
							    matching it against the dictionary would silently stop matching
							    the moment the portal switched to Chinese. */}
							{sub.backed &&
								canEdit &&
								plan.label === "Custom" &&
								!isBilledTier && (
									<div className="mt-2">
										{waitingOn ? (
											/*
											 * A waiting state, not a dead button. The disabled button
											 * that used to sit here read as something broken rather
											 * than something in progress — the agency cannot act, so
											 * it should not be shown a control at all.
											 */
											<div className="flex items-center gap-2 rounded-lg border border-[rgba(244,183,64,.28)] bg-[var(--iz-amber-bg,rgba(244,183,64,.12))] px-2.5 py-2">
												<span className="relative flex h-2 w-2 shrink-0">
													<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--iz-amber,#f4b740)] opacity-60" />
													<span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--iz-amber,#f4b740)]" />
												</span>
												<div className="min-w-0">
													<p className="iz-tiny font-semibold text-[var(--iz-amber,#f4b740)]">
														{t.subscription.requestedWithAdmin}
													</p>
													<p className="iz-tiny iz-muted2">
														{t.subscription.preparingYourPrice}
													</p>
												</div>
											</div>
										) : (
											/*
											 * Styled to the tile it sits on rather than the neutral
											 * soft button used elsewhere: Custom carries the violet
											 * accent everywhere on this screen, and a grey button
											 * under a violet "Renegotiate Price" read as disabled.
											 */
											<button
												type="button"
												className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(139,124,246,.4)] bg-[rgba(139,124,246,.1)] px-3 py-2 transition-colors hover:bg-[rgba(139,124,246,.18)] disabled:opacity-60"
												disabled={sub.isRequesting}
												onClick={handleAskForCustom}
											>
												<Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--iz-violet-l)]" />
												<span className="iz-tiny font-semibold text-[var(--iz-violet-l)]">
													{sub.isRequesting
														? t.subscription.sending
														: t.subscription.askAdminForPrice}
												</span>
											</button>
										)}
									</div>
								)}
						</IzCard>
					);
				})}
			</div>

			<IzSectionLabel>
				{sub.backed
					? t.subscription.currentSubscription
					: t.subscription.billingHistoryTitle}
			</IzSectionLabel>
			{sub.backed && (
				<p className="iz-tiny iz-muted2 -mt-1 mb-2">
					{t.subscription.whatYouSubscribedTo}
				</p>
			)}
			<div className="space-y-2">
				{sub.backed && sub.isHistoryLoading ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted text-center py-4">
							{t.subscription.loadingSubscription}
						</p>
					</IzCard>
				) : billingHistory.length === 0 ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted text-center py-4">
							{sub.backed
								? fill(t.subscription.noActiveSubscription, {
										plan: billedTierLabel,
									})
								: t.subscription.noSubscriptionInvoices}
						</p>
					</IzCard>
				) : (
					billingHistory.map((row) => (
						<SubscriptionRecordCard key={row.id} row={row} />
					))
				)}
				<PastSubscriptionsDisclosure rows={sub.pastSubscriptions} />
			</div>

			{sub.backed && (
				<>
					<IzSectionLabel>{t.agencyMisc.paymentHistory}</IzSectionLabel>
					<p className="iz-tiny iz-muted2 -mt-1 mb-2">
						{t.subscription.oneRowPerPeriod}
					</p>
					<PaymentHistoryList
						invoices={sub.paymentHistory}
						isLoading={sub.isPaymentHistoryLoading}
					/>
				</>
			)}

			{showCollections && (
				<>
					<IzSectionLabel>{t.agencyMisc.collectionsOwedToYou}</IzSectionLabel>
					<p className="iz-tiny iz-muted2 -mt-1 mb-2">
						{t.subscription.moneyComingIn}
					</p>

					<IzCard>
						<div className="grid grid-cols-3 gap-2 text-center">
							<div>
								<p className="iz-tiny iz-muted2">{t.agencyMisc.outstanding}</p>
								<p className="mt-1 font-sora text-base font-bold text-[var(--iz-gold-l)]">
									{formatRM(collections.totals.outstandingRm)}
								</p>
							</div>
							<div>
								<p className="iz-tiny iz-muted2">{t.agencyMisc.overdue}</p>
								<p
									className={`mt-1 font-sora text-base font-bold ${
										collections.totals.overdueRm > 0
											? "text-[var(--iz-red-l,#ff8080)]"
											: ""
									}`}
								>
									{formatRM(collections.totals.overdueRm)}
								</p>
							</div>
							<div>
								<p className="iz-tiny iz-muted2">{t.agencyMisc.settled}</p>
								<p className="mt-1 font-sora text-base font-bold">
									{formatRM(collections.totals.settledRm)}
								</p>
							</div>
						</div>
						{collections.totals.overdueRm > 0 && (
							<p className="iz-tiny iz-muted mt-3 flex items-center gap-1.5 border-t border-[var(--iz-line)] pt-2">
								<TriangleAlert className="h-3.5 w-3.5 shrink-0" />
								{t.subscription.overduePartOfOutstanding}
							</p>
						)}
					</IzCard>

					{collections.drafts.length > 0 && (
						<>
							<p className="iz-tiny iz-muted2 mt-3 mb-1">
								{fill(t.agencyMisc.draftsNotShownYet, {
									total: formatRM(collections.totals.draftRm),
								})}
							</p>
							<div className="space-y-2">
								{collections.drafts.map((inv) => (
									<IzCard key={inv.id} flat>
										<div className="iz-between gap-2">
											<div className="flex min-w-0 items-start gap-2">
												<Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
												<div className="min-w-0">
													<p className="iz-sm font-semibold truncate">
														{inv.outletName}
													</p>
													<p className="iz-tiny iz-muted">
														{collectionWeekLabel(inv.weekStart, inv.weekEnd)} ·{" "}
														{/* Same label the roster timetable prints, so it shares
														    the key rather than growing a second wording for
														    one fact. Chinese has no plural — the two English
														    forms are spelled out, never an appended "s". */}
														{fill(
															inv.sourceAssignmentIds.length === 1
																? t.rosterGrid.shiftCountOne
																: t.rosterGrid.shiftCountMany,
															{ n: inv.sourceAssignmentIds.length },
														)}
													</p>
												</div>
											</div>
											<div className="shrink-0 text-right">
												{/* No Issue button: nothing drafts collections any more and
												    the API has no create endpoint, so this list can never
												    gain a row. A button that cannot be reached is worse
												    than none — it implies the lane still runs. */}
												<p className="iz-sm font-bold">
													{formatRM(collectionAmountRm(inv))}
												</p>
											</div>
										</div>
									</IzCard>
								))}
							</div>
						</>
					)}

					<div className="mt-3 space-y-2">
						{collections.isLoading ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted text-center py-4">
									{t.subscription.loadingCollections}
								</p>
							</IzCard>
						) : collections.invoices.length === 0 ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted text-center py-4">
									{t.subscription.noCollections}
								</p>
							</IzCard>
						) : (
							collections.issued.map((inv) => {
								const aging = inv.aging
									? COLLECTION_AGING_PILL[inv.aging]
									: null;
								return (
									<IzCard key={inv.id} flat>
										<div className="iz-between gap-2">
											<div className="flex min-w-0 items-start gap-2">
												<Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
												<div className="min-w-0">
													<p className="iz-sm font-semibold truncate">
														{inv.outletName}
													</p>
													<p className="iz-tiny iz-muted">
														{collectionWeekLabel(inv.weekStart, inv.weekEnd)}
														{inv.settledAt
															? fill(t.subscription.settledOn, {
																	date: collectionStampLabel(inv.settledAt),
																})
															: inv.issuedAt
																? fill(t.subscription.issuedOn, {
																		date: collectionStampLabel(inv.issuedAt),
																	})
																: ""}
													</p>
												</div>
											</div>
											<div className="shrink-0 text-right">
												<p className="iz-sm font-bold">
													{formatRM(collectionAmountRm(inv))}
												</p>
												<div className="mt-1 flex items-center justify-end gap-1.5">
													{inv.status === "settled" ? (
														<IzPill variant="green">
															{t.agencyMisc.settled}
														</IzPill>
													) : aging ? (
														<IzPill variant={aging.variant}>
															{aging.label(t)}
														</IzPill>
													) : (
														<IzPill variant="ink">{inv.status}</IzPill>
													)}
												</div>
												{inv.status === "issued" && canManageCollections && (
													<button
														type="button"
														className="iz-btn iz-btn-soft mt-1.5 !py-1 !text-[11px]"
														disabled={collections.isMutating}
														onClick={() => handleSettle(inv.id, inv.outletName)}
													>
														{t.subscription.markSettled}
													</button>
												)}
											</div>
										</div>
									</IzCard>
								);
							})
						)}
					</div>
				</>
			)}

			<OutletSection
				title={t.agencyMisc.paymentMethod}
				iconKey="Payment method"
				hint={
					sub.backed
						? sub.card
							? // Two keys, not one sentence: the instrument stamp already had
								// a key, and the charge date is an optional tail that only a
								// saved renewal date earns. The stamp comes from the one
								// shared describer, so a bank transfer does not print
								// "Card ···· ····" as if its digits had failed to load.
								describePaymentMethod(sub.card, {
									transfer: t.subscription.savedTransfer,
									fpx: t.subscription.savedFpx,
									fpxLink: t.subscription.savedFpxLink,
									ewallet: t.subscription.methodEwallet,
								}) +
								(realRenewalLabel
									? fill(
											// "Next charge" is a promise only an auto-chargeable
											// rail can keep. A bank transfer and a mandate the
											// bank has not approved RENEW on that date; nothing
											// collects on it by itself.
											willAutoCharge(sub.card)
												? t.agencyMisc.nextChargeSuffix
												: t.agencyMisc.renewsOnSuffix,
											{ date: realRenewalLabel },
										)
									: "")
							: t.subscription.noCardSavedYet
						: fill(t.subscription.visaNextCharge, {
								last4: CARD_LAST4,
								date: renewalDate,
							})
				}
				collapsible
				defaultOpen={false}
				className="!mt-5"
			>
				<PaymentMethodCard
					card={sub.backed ? sub.card : null}
					backed={sub.backed}
					demoLast4={CARD_LAST4}
					canEdit={canEdit}
					isLoading={sub.backed && sub.isCardLoading}
					isSaving={sub.isSavingCard}
					billedLabel={fill(t.subscription.billedWeeklyFromUsage, {
						tier: billedTierLabel,
						price: billedPriceLabel,
					})}
					onSave={async (input) => {
						const result = await sub.saveCard(input);
						toast(
							result.ok
								? t.subscription.cardSaved
								: (result.reason ?? t.subscription.couldNotSaveCard),
							result.ok ? "success" : "warn",
						);
						return result.ok;
					}}
				/>

				<div className="mt-2 flex items-center gap-2 iz-tiny iz-muted">
					<Calendar className="h-3.5 w-3.5" />
					{sub.backed
						? realRenewalLabel
							? fill(t.subscription.nextWeeklyCharge, {
									date: realRenewalLabel,
								})
							: t.subscription.nothingToCharge
						: fill(t.subscription.nextWeeklyCharge, { date: renewalDate })}
				</div>
			</OutletSection>
		</div>
	);
}
