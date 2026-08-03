import { isoKeyFromDate } from "@agency-portal/components/iz/HistDateCalendar";
import {
	formatRM,
	IzCard,
	IzPageTitle,
	IzPill,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useOutletCollections } from "@agency-portal/hooks/use-outlet-collections";
import { useOutletSubscription } from "@agency-portal/hooks/use-outlet-subscription";
import {
	COLLECTION_AGING_PILL,
	collectionAmountRm,
	collectionStampLabel,
	collectionWeekLabel,
} from "@agency-portal/lib/collections";
import {
	formatOutletPlanPrPickerRule,
	getOutletSubscriptionPlan,
	maxDailyOutletNamedPrCount,
	OUTLET_SUBSCRIPTION_ADDONS,
	OUTLET_SUBSCRIPTION_PLANS,
	type OutletSubscriptionAddon,
	type OutletSubscriptionPlanId,
	outletNamedPrCountForDate,
} from "@agency-portal/lib/outlet-demo";
import { outletCan } from "@agency-portal/lib/outlet-rbac";
import {
	outletMatches,
	tonightShiftOutletName,
} from "@agency-portal/lib/portal-sync";
import { useStore } from "@agency-portal/lib/store";
import type { SubscriptionRecordRow } from "@agency-portal/lib/subscription-record";
import { createFileRoute } from "@tanstack/react-router";
import {
	Calendar,
	Check,
	CreditCard,
	Plug,
	Receipt,
	Sparkles,
	Users,
} from "lucide-react";
import { useMemo, useState } from "react";

const RENEWAL_DATE = "15 Jul 2026";

const MONTHLY_PLANS = OUTLET_SUBSCRIPTION_PLANS.filter((p) => !p.renegotiate);

const POS_FEATURES = [
	"Real-time drink & table sales from your POS",
	"Custom setup for your venue layout",
	"Pricing quoted by InnocenZ admin",
] as const;

export const Route = createFileRoute("/outlet/subscription")({
	component: OutletSubscriptionPage,
});

function PosIntegrationAddonCard({
	addon,
	canEdit,
	canCancel,
	quotePending,
	activeAddonPriceRm,
	contactLine,
	onRequestQuote,
	onCancelQuote,
	onRemoveAddon,
}: {
	/** Ask the admin to end the add-on and go back to plan-only billing. */
	onRemoveAddon: () => void;
	addon: OutletSubscriptionAddon;
	canEdit: boolean;
	/**
	 * The agreed price once the admin has resolved the quote — at which point
	 * this venue IS on the add-on, alongside its plan. Null while it is only a
	 * product on offer.
	 */
	activeAddonPriceRm: number | null;
	/**
	 * Whether withdrawing is actually possible. In a real session the request
	 * lives with the admin and there is no withdraw endpoint, so offering
	 * "Cancel request" would clear the badge here while the admin still holds
	 * the request — a button that lies.
	 */
	canCancel: boolean;
	quotePending: boolean;
	contactLine: string;
	onRequestQuote: () => void;
	onCancelQuote: () => void;
}) {
	return (
		<div className="iz-outlet-pos-addon col-span-2">
			<div className="iz-outlet-pos-addon__glow" aria-hidden />
			<div className="iz-outlet-pos-addon__inner">
				<div className="iz-outlet-pos-addon__head">
					<div className="iz-outlet-pos-addon__icon-wrap">
						<Plug className="h-6 w-6" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<p className="iz-outlet-pos-addon__title">{addon.label}</p>
							<IzPill variant="violet" className="!py-0.5 !text-[10px]">
								Add-on
							</IzPill>
							{activeAddonPriceRm !== null ? (
								<IzPill variant="green" className="!py-0.5 !text-[10px]">
									Active
								</IzPill>
							) : (
								quotePending && (
									<IzPill variant="green" className="!py-0.5 !text-[10px]">
										Request sent
									</IzPill>
								)
							)}
						</div>
						<p className="iz-outlet-pos-addon__subtitle">
							{activeAddonPriceRm !== null
								? `${addon.capacityLabel} · ${formatRM(activeAddonPriceRm)} / month · agreed with InnocenZ admin`
								: `${addon.capacityLabel} · ${addon.priceLabel}`}
						</p>
					</div>
					<Sparkles className="h-5 w-5 shrink-0 text-[var(--iz-violet-l)] opacity-80" />
				</div>

				<p className="iz-outlet-pos-addon__lead">{addon.description}</p>

				<ul className="iz-outlet-pos-addon__features">
					{POS_FEATURES.map((feature) => (
						<li key={feature}>
							<Check className="h-4 w-4 shrink-0 text-[var(--iz-green)]" />
							<span>{feature}</span>
						</li>
					))}
				</ul>

				{activeAddonPriceRm !== null ? (
					<div className="iz-outlet-pos-addon__sent">
						<p className="iz-outlet-pos-addon__sent-title">
							POS integration active
						</p>
						<p className="iz-outlet-pos-addon__sent-body">
							InnocenZ admin agreed {formatRM(activeAddonPriceRm)} / month for
							your venue. This is billed on top of your plan.
						</p>
						{canEdit && (
							<button
								type="button"
								className="iz-btn iz-btn-soft iz-outlet-pos-addon__cancel"
								onClick={onRemoveAddon}
							>
								Remove POS integration
							</button>
						)}
					</div>
				) : quotePending ? (
					<div className="iz-outlet-pos-addon__sent">
						<p className="iz-outlet-pos-addon__sent-title">Admin notified</p>
						<p className="iz-outlet-pos-addon__sent-body">
							InnocenZ admin received your request and will contact{" "}
							{contactLine} to negotiate pricing.
						</p>
						{canEdit && canCancel && (
							<button
								type="button"
								className="iz-btn iz-btn-soft iz-outlet-pos-addon__cancel"
								onClick={onCancelQuote}
							>
								Cancel request
							</button>
						)}
					</div>
				) : (
					canEdit && (
						<button
							type="button"
							className="iz-btn iz-btn-primary iz-outlet-pos-addon__cta"
							onClick={onRequestQuote}
						>
							Request admin quote
						</button>
					)
				)}
			</div>
		</div>
	);
}

function OutletSubscriptionPage() {
	const outletSubRole = useStore((s) => s.outletSubRole);
	const outletOwner = useStore((s) => s.outletOwner);
	const shifts = useStore((s) => s.shifts);
	const paymentCardLast4 = useStore((s) => s.paymentCardLast4);
	const posIntegrationQuoteRequests = useStore(
		(s) => s.posIntegrationQuoteRequests,
	);
	const saveOutletOwner = useStore((s) => s.saveOutletOwner);
	const recordOutletSubscriptionPlanChange = useStore(
		(s) => s.recordOutletSubscriptionPlanChange,
	);
	const requestPosIntegrationQuote = useStore(
		(s) => s.requestPosIntegrationQuote,
	);
	const cancelPosIntegrationQuoteRequest = useStore(
		(s) => s.cancelPosIntegrationQuoteRequest,
	);
	const demoBilling = useStore((s) => s.outletSubscriptionBilling);
	const updateOutletPaymentCard = useStore((s) => s.updateOutletPaymentCard);
	const toast = useStore((s) => s.toast);
	const canEdit = outletCan(outletSubRole, "editSettings");
	// Real login → backend billing ledger + real POS-quote create (see the hook).
	const backend = useOutletSubscription();

	// What this venue owes its AGENCY for PR work — a different creditor to the
	// InnocenZ subscription above. Read-only by design: settling is agency-side,
	// because the outlet is the one party with an interest in claiming it paid.
	const collections = useOutletCollections();
	const showCollections =
		collections.backed && outletCan(outletSubRole, "viewBilling");
	const [quoteSentLocal, setQuoteSentLocal] = useState(false);
	// Instant feedback for the tap; the server's answer (backend.pendingPlanLabel)
	// takes over as soon as it arrives and is what survives a refresh.
	const [planChangeRequestedLocal, setPlanChangeRequestedLocal] = useState<
		string | null
	>(null);
	const planChangeRequested = backend.backed
		? (backend.pendingPlanLabel ?? planChangeRequestedLocal)
		: null;

	/**
	 * Real sessions read the `member_subscription` ledger; demo sessions keep the
	 * store's invoices, mapped onto the same row shape so the render has one
	 * branch. The plan rate-card + payment card stay on demo data either way (see
	 * the hook's docstring).
	 *
	 * The demo rows genuinely ARE invoice-shaped, with a settled/pending state, so
	 * "Paid" is honest for them. The backend rows are not, which is why they no
	 * longer borrow that wording.
	 */
	const billingHistory = useMemo<SubscriptionRecordRow[]>(() => {
		if (backend.backed) return backend.billingHistory;
		return demoBilling.map((inv) => ({
			id: inv.id,
			title: `InnocenZ Outlet · ${inv.planLabel}`,
			detail: inv.detail,
			dateLabel: inv.issueDate,
			amountRm: inv.amount,
			statusLabel: inv.status === "SETTLED" ? "Paid" : inv.status,
			tone: inv.status === "SETTLED" ? "green" : "amber",
		}));
	}, [backend.backed, backend.billingHistory, demoBilling]);

	const outletName = tonightShiftOutletName(shifts);
	/**
	 * Which plan this venue is on. A real session reads its ACTIVE
	 * `member_subscription` row — the same ledger the admin History page reads —
	 * so the Current pill here and the admin's screen state the same fact, and an
	 * approved switch shows up on its own. The demo store is the fallback (demo
	 * sessions, or a venue with no active row yet).
	 */
	const currentPlan = useMemo(() => {
		const fromLedger = backend.activePlanName
			? MONTHLY_PLANS.find(
					(plan) =>
						plan.label.trim().toLowerCase() ===
						backend.activePlanName?.trim().toLowerCase(),
				)
			: undefined;
		// A REAL session never falls back to the demo store. The store is shared
		// by every venue opened in this browser, so falling back showed one venue
		// another's plan as "Current" — a venue on Pro (RM 2,999) was told it was
		// on Scale (RM 6,999). With no active row there is simply no current plan,
		// and the card renders none.
		if (backend.backed) return fromLedger ?? null;
		return getOutletSubscriptionPlan(outletOwner.subscriptionPlanId);
	}, [backend.backed, backend.activePlanName, outletOwner.subscriptionPlanId]);
	const contactLine = outletOwner.email || outletOwner.mobile;
	/**
	 * The next billing date, derived from this venue's own subscription row. A
	 * real session shows a real date; when the ledger has nothing active the
	 * label is omitted entirely rather than printing the old hardcoded
	 * "15 Jul 2026", which was invented and already in the past.
	 */
	const renewalLabel = backend.backed
		? backend.nextRenewalDate
			? backend.nextRenewalDate.toLocaleDateString("en-GB", {
					day: "numeric",
					month: "short",
					year: "numeric",
				})
			: null
		: RENEWAL_DATE;

	const posQuotePending = useMemo(
		() =>
			posIntegrationQuoteRequests.some(
				(r) => r.status === "pending" && outletMatches(r.outlet, outletName),
			),
		[posIntegrationQuoteRequests, outletName],
	);
	// A real session reads its own outstanding quote back from the server, so
	// "Request sent" survives a refresh; the local flag only covers the moment
	// between the tap and the refetch. Demo sessions keep the store's flag.
	const quotePending = backend.backed
		? backend.posQuotePending || quoteSentLocal
		: posQuotePending;

	const handleRequestQuote = () => {
		if (backend.backed) {
			backend
				.requestPosQuote({
					email: outletOwner.email,
					phone: outletOwner.mobile,
				})
				.then(() => {
					setQuoteSentLocal(true);
					toast("POS integration request sent to admin", "success");
				})
				.catch(() => toast("Could not send request — try again", "warn"));
			return;
		}
		requestPosIntegrationQuote();
	};

	/**
	 * Leaving the add-on is a request, like joining it: the admin ends the
	 * billing. The card keeps showing Active until they do, so the venue is never
	 * told a charge stopped before it actually did.
	 */
	const handleRemoveAddon = () => {
		backend
			.requestPosRemoval()
			.then((filed) => {
				toast(
					filed
						? "Request to remove POS integration sent to InnocenZ admin"
						: "Could not send the request — try again",
					filed ? "success" : "warn",
				);
			})
			.catch(() => toast("Could not send the request — try again", "warn"));
	};

	const handleCancelQuote = () => {
		if (backend.backed) {
			// Admin still holds the request (no outlet delete route); clear the
			// local indicator only.
			setQuoteSentLocal(false);
			toast("POS integration request withdrawn", "info");
			return;
		}
		cancelPosIntegrationQuoteRequest();
	};

	const todayIso = isoKeyFromDate(new Date());
	const namedPrsToday = useMemo(
		() => outletNamedPrCountForDate(shifts, outletName, todayIso),
		[shifts, outletName, todayIso],
	);
	const peakDailyNamedPrs = useMemo(
		() => maxDailyOutletNamedPrCount(shifts, outletName),
		[shifts, outletName],
	);

	const selectPlan = (planId: OutletSubscriptionPlanId) => {
		if (!canEdit || planId === currentPlan?.id) return;
		const next = getOutletSubscriptionPlan(planId);
		if (next.renegotiate) return;
		if (peakDailyNamedPrs > next.prPerDayMax) {
			toast(
				`Peak day has ${peakDailyNamedPrs} requested PRs — reduce to ${next.prPerDayMax}/day before downgrading to ${next.label}`,
				"warn",
			);
			return;
		}
		// A real session must not switch itself: the venue files a plan_change
		// request and stays on its current plan until an admin approves, which is
		// what writes the billing ledger. Only the demo store flips instantly.
		if (backend.backed) {
			if (!backend.planCatalogReady) {
				toast("Plan list still loading — try again in a moment", "warn");
				return;
			}
			backend
				.requestPlanChange({
					toPlanLabel: next.label,
					fromPlanLabel: currentPlan?.label,
					contact: { email: outletOwner.email, phone: outletOwner.mobile },
				})
				.then((result) => {
					if (!result.ok) {
						// The server's own words when it has them — "Already on
						// Essential — no switch needed" tells the venue what to do;
						// "try again" told it nothing and it kept retrying.
						toast(
							result.reason ?? "Could not send the switch — try again",
							"warn",
						);
						return;
					}
					setPlanChangeRequestedLocal(next.label);
					toast(
						`Switch to ${next.label} sent to InnocenZ admin for approval`,
						"success",
					);
				});
			return;
		}
		saveOutletOwner({ subscriptionPlanId: planId });
		recordOutletSubscriptionPlanChange(planId);
		toast(
			`Switched to ${next.label} · ${formatRM(next.monthlyRm)}/mo · ${next.capacityLabel} · ${formatOutletPlanPrPickerRule(next)}`,
			"success",
		);
	};

	if (!outletCan(outletSubRole, "viewSettings")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>Access restricted</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						You do not have access to subscription billing.
					</p>
				</IzCard>
			</div>
		);
	}

	const isFinanceReadOnly = outletSubRole === "outlet_finance";

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>Subscription</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">{outletOwner.orgName}</p>
				{isFinanceReadOnly && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						Finance view — read-only · contact owner to change plan or card
					</p>
				)}
			</header>

			<IzSectionLabel>Plans · monthly</IzSectionLabel>
			<p className="iz-tiny iz-muted2 -mt-1 mb-2">
				PR limit = max specific PRs you name per day (agency fill does not
				count) · {namedPrsToday} requested today · peak day {peakDailyNamedPrs}
			</p>
			<div className="grid grid-cols-2 gap-2">
				{MONTHLY_PLANS.map((plan) => {
					const isCurrent = plan.id === currentPlan?.id;
					const atCapacity = namedPrsToday >= plan.prPerDayMax;
					return (
						<IzCard
							key={plan.id}
							className={
								isCurrent
									? "border-[rgba(57,217,138,.35)] bg-[rgba(57,217,138,.06)]"
									: undefined
							}
						>
							<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-sora text-sm font-bold">{plan.label}</p>
										{isCurrent && <IzPill variant="green">Current</IzPill>}
										{planChangeRequested === plan.label && !isCurrent && (
											<IzPill variant="violet">Awaiting admin</IzPill>
										)}
										{atCapacity && !isCurrent && (
											<IzPill variant="amber">At daily limit</IzPill>
										)}
									</div>
									<p className="mt-1 text-lg font-bold text-[var(--iz-gold-l)]">
										{formatRM(plan.monthlyRm)}
										<span className="iz-tiny iz-muted font-normal">
											{" "}
											/ month
										</span>
									</p>
								</div>
								<div className="shrink-0 sm:text-right">
									<div className="flex items-center gap-1.5 text-[var(--iz-txt)] sm:justify-end">
										<Users className="h-4 w-4 text-[var(--iz-gold)]" />
										<span className="font-sora text-sm font-bold">
											{plan.capacityLabel}
										</span>
									</div>
									<p className="iz-tiny iz-muted mt-0.5">
										{formatOutletPlanPrPickerRule(plan)}
									</p>
								</div>
							</div>
							{isCurrent ? (
								<p className="iz-tiny iz-muted2 mt-2">
									{renewalLabel ? `Renewal ${renewalLabel} · ` : ""}
									{namedPrsToday} / {plan.prPerDayMax} requested PRs today ·
									pool of {plan.prPoolSize}
								</p>
							) : (
								canEdit &&
								(planChangeRequested === plan.label ? (
									<p className="iz-tiny iz-muted2 mt-3">
										Sent to InnocenZ admin — you stay on{" "}
										{currentPlan?.label ?? "your current plan"} until it is
										approved.
									</p>
								) : (
									<button
										type="button"
										className="iz-btn iz-btn-soft mt-3 w-full"
										// Until the venue's real plan has loaded, the Current pill
										// is a demo guess — offering a switch here let a venue ask
										// for the plan it was already on, which the server then
										// (rightly) refused.
										disabled={
											backend.isRequestingPlanChange || backend.isLoading
										}
										onClick={() => selectPlan(plan.id)}
									>
										{backend.isLoading ? "Loading…" : `Switch to ${plan.label}`}
									</button>
								))
							)}
						</IzCard>
					);
				})}

				{OUTLET_SUBSCRIPTION_ADDONS.map((addon) => (
					<PosIntegrationAddonCard
						key={addon.id}
						addon={addon}
						canEdit={canEdit}
						canCancel={!backend.backed}
						quotePending={quotePending}
						activeAddonPriceRm={backend.addonAmountRm}
						contactLine={contactLine}
						onRequestQuote={handleRequestQuote}
						onCancelQuote={handleCancelQuote}
						onRemoveAddon={handleRemoveAddon}
					/>
				))}
			</div>

			<IzSectionLabel>
				{backend.backed ? "Subscription record" : "Billing history"}
			</IzSectionLabel>
			{backend.backed && (
				<p className="iz-tiny iz-muted2 -mt-1 mb-2">
					Your plan history with InnocenZ — one row per subscription, not per
					charge. It records what you subscribed to and when, so it does not say
					whether a given month was paid.
				</p>
			)}
			<div className="space-y-2">
				{billingHistory.length === 0 ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted py-4 text-center">
							{backend.backed
								? "No subscription on record for this venue yet."
								: "No subscription invoices yet."}
						</p>
					</IzCard>
				) : (
					billingHistory.map((row) => (
						<IzCard key={row.id} flat>
							<div className="iz-between gap-2">
								<div className="flex min-w-0 items-start gap-2">
									<Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
									<div className="min-w-0">
										<p className="iz-sm truncate font-semibold">{row.title}</p>
										<p className="iz-tiny iz-muted">
											{row.dateLabel}
											{row.detail ? ` · ${row.detail}` : ""}
										</p>
									</div>
								</div>
								<div className="shrink-0 text-right">
									<p className="iz-sm font-bold">{formatRM(row.amountRm)}</p>
									<IzPill variant={row.tone} className="!mt-1">
										{row.statusLabel}
									</IzPill>
								</div>
							</div>
						</IzCard>
					))
				)}
			</div>

			{showCollections && (
				<>
					<IzSectionLabel>PR work · owed to your agency</IzSectionLabel>
					<p className="iz-tiny iz-muted2 -mt-1 mb-2">
						Separate from the InnocenZ subscription above — one statement per
						week, built from shifts your venue actually completed. InnocenZ does
						not take this payment; you settle it with your agency directly, and
						they mark it received.
					</p>

					<IzCard>
						<div className="grid grid-cols-3 gap-2 text-center">
							<div>
								<p className="iz-tiny iz-muted2">Owed now</p>
								<p className="mt-1 font-sora text-base font-bold text-[var(--iz-gold-l)]">
									{formatRM(collections.totals.owedRm)}
								</p>
							</div>
							<div>
								<p className="iz-tiny iz-muted2">Overdue</p>
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
								<p className="iz-tiny iz-muted2">Paid</p>
								<p className="mt-1 font-sora text-base font-bold">
									{formatRM(collections.totals.settledRm)}
								</p>
							</div>
						</div>
						{collections.totals.overdueRm > 0 && (
							<p className="iz-tiny iz-muted mt-3 border-t border-[var(--iz-line)] pt-2">
								Overdue is part of what you owe, not on top of it
							</p>
						)}
						{collections.hasMultipleAgencies && (
							<p className="iz-tiny iz-muted mt-2">
								More than one agency bills this venue. A statement records which
								agency raised it, but not their name, so the rows below cannot
								say who each one is from.
							</p>
						)}
					</IzCard>

					<div className="mt-3 space-y-2">
						{collections.isLoading ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted py-4 text-center">
									Loading statements…
								</p>
							</IzCard>
						) : collections.invoices.length === 0 ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted py-4 text-center">
									No statements yet. Your agency issues these weekly — anything
									they are still reviewing is not shown here.
								</p>
							</IzCard>
						) : (
							collections.invoices.map((inv) => {
								const aging = inv.aging
									? COLLECTION_AGING_PILL[inv.aging]
									: null;
								return (
									<IzCard key={inv.id} flat>
										<div className="iz-between gap-2">
											<div className="flex min-w-0 items-start gap-2">
												<Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
												<div className="min-w-0">
													<p className="iz-sm truncate font-semibold">
														PR work ·{" "}
														{collectionWeekLabel(inv.weekStart, inv.weekEnd)}
													</p>
													<p className="iz-tiny iz-muted">
														{inv.sourceAssignmentIds.length} completed shift
														{inv.sourceAssignmentIds.length === 1 ? "" : "s"}
														{inv.settledAt
															? ` · marked received ${collectionStampLabel(inv.settledAt)}`
															: inv.issuedAt
																? ` · issued ${collectionStampLabel(inv.issuedAt)}`
																: ""}
													</p>
												</div>
											</div>
											<div className="shrink-0 text-right">
												<p className="iz-sm font-bold">
													{formatRM(collectionAmountRm(inv))}
												</p>
												{inv.status === "settled" ? (
													<IzPill variant="green" className="!mt-1">
														Received
													</IzPill>
												) : aging ? (
													<IzPill variant={aging.variant} className="!mt-1">
														{aging.label}
													</IzPill>
												) : (
													<IzPill variant="ink" className="!mt-1">
														{inv.status}
													</IzPill>
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
				title="Payment method"
				hint={`Visa ···· ${paymentCardLast4} · renewal ${RENEWAL_DATE}`}
				collapsible
				defaultOpen={false}
				className="!mt-5"
			>
				<IzCard flat>
					<div className="flex items-center gap-2">
						<CreditCard className="h-4 w-4 text-[var(--iz-muted)]" />
						<div>
							<p className="iz-sm font-semibold">
								Visa ···· {paymentCardLast4}
							</p>
							<p className="iz-tiny iz-muted">
								Billed monthly ·{" "}
								{currentPlan ? formatRM(currentPlan.monthlyRm) : "—"} · auto-pay
								enabled
							</p>
						</div>
					</div>
					{canEdit && (
						<button
							type="button"
							className="iz-btn iz-btn-soft mt-3 w-full"
							onClick={() =>
								updateOutletPaymentCard(
									String(Math.floor(1000 + Math.random() * 9000)),
								)
							}
						>
							Update card
						</button>
					)}
				</IzCard>

				<div className="iz-tiny iz-muted mt-2 flex items-center gap-2">
					<Calendar className="h-3.5 w-3.5" />
					Next renewal {RENEWAL_DATE}
				</div>
			</OutletSection>
		</div>
	);
}
