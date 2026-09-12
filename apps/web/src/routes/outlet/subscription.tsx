import { isoKeyFromDate } from "@agency-portal/components/iz/HistDateCalendar";
import { PaymentMethodCard } from "@agency-portal/components/iz/PaymentMethodCard";
import { PaymentHistoryList } from "@agency-portal/components/iz/SubscriptionRecordList";
import {
	formatRM,
	IzCard,
	IzPageTitle,
	IzPill,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useOutletCollections } from "@agency-portal/hooks/use-outlet-collections";
import { useOutletPostJob } from "@agency-portal/hooks/use-outlet-post-job";
import { useOutletSubscription } from "@agency-portal/hooks/use-outlet-subscription";
import {
	COLLECTION_AGING_PILL,
	collectionAmountRm,
	collectionStampLabel,
	collectionWeekLabel,
} from "@agency-portal/lib/collections";
import {
	getOutletSubscriptionPlan,
	maxDailyOutletNamedPrCount,
	OUTLET_SUBSCRIPTION_ADDONS,
	OUTLET_SUBSCRIPTION_PLANS,
	type OutletSubscriptionAddon,
	type OutletSubscriptionPlan,
	type OutletSubscriptionPlanId,
	outletNamedPrCountForDate,
} from "@agency-portal/lib/outlet-demo";
import {
	outletMatches,
	tonightShiftOutletName,
} from "@agency-portal/lib/portal-sync";
import { useStore } from "@agency-portal/lib/store";
import { countBillingWindows } from "@agency-portal/lib/subscription-due";
import { periodLabel } from "@agency-portal/lib/subscription-record";
import { useOutletCan, useOutletIsOwner} from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Check, Plug, Receipt, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import {
	addonCopy,
	planCapacityLabel,
	planDescription,
} from "@/lib/portal-i18n/plan-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	describePaymentMethod,
	willAutoCharge,
} from "@/services/payment-method";

const RENEWAL_DATE = "15 Jul 2026";

/**
 * Collections (what this venue owes its agency for PR work) is HIDDEN — owner,
 * 12 Aug 2026.
 *
 * Gated rather than deleted, because the section is not broken: since the
 * weekly job stopped drafting `collection_invoice` rows that same day, and no
 * API can create one, it can only ever show frozen history beside an empty
 * total — a creditor screen for money the app neither raises nor moves. The
 * table, the hook and the markup stay so that turning this back on is one line
 * if outlet↔agency billing ever comes back into the app.
 */
const SHOW_COLLECTIONS = false;

const MONTHLY_PLANS = OUTLET_SUBSCRIPTION_PLANS.filter((p) => !p.renegotiate);

const POS_FEATURES = [
	(t: PortalTranslations) => t.outletSubscription.posFeatureRealtime,
	(t: PortalTranslations) => t.outletSubscription.posFeatureSetup,
	(t: PortalTranslations) => t.outletSubscription.posFeatureQuoted,
] as const;

/**
 * Translated twin of `formatOutletPlanPrPickerRule`, built from the plan's
 * own numbers rather than its prose.
 *
 * The shared helper stays as it is: Post Job composes its result into a longer
 * sentence and translating it here would change that screen too, unverified.
 */
function outletPickerRule(
	plan: OutletSubscriptionPlan,
	t: PortalTranslations,
): string {
	if (plan.renegotiate)
		return planDescription("outlet", plan.id, plan.description, t);
	if (plan.id === "premier") return t.outletSubscription.pickerRulePremier;
	return fill(t.outletSubscription.pickerRule, {
		select: plan.prSelectMax,
		pool: plan.prPoolSize,
	});
}

export const Route = createFileRoute("/outlet/subscription")({
	component: OutletSubscriptionPage,
});

function PosIntegrationAddonCard({
	addon,
	canEdit,
	canCancel,
	quotePending,
	pendingKind,
	activeAddonPriceRm,
	windowLabel = null,
	renewsOn = null,
	requoteBlockedNote = null,
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
	 * The add-on lane's current billing window and next renewal, formatted.
	 * Its own dates, not the plan's: POS is bought after the plan, so its month
	 * can start on a different day. Null on a demo session or before the first
	 * period is minted, and then nothing is printed rather than a guess.
	 */
	windowLabel?: string | null;
	renewsOn?: string | null;
	/**
	 * The sentence that explains why a re-quote is refused right now — unpaid
	 * periods — or null when the ask is allowed. Printed on the card and the
	 * gold button disabled, instead of a toast nobody caught.
	 */
	requoteBlockedNote?: string | null;
	/**
	 * Whether withdrawing is actually possible.
	 *
	 * Was hardcoded false on real sessions, because no withdraw endpoint existed
	 * and offering "Cancel request" would have cleared the badge here while the
	 * admin still held the request — a button that lies. The endpoint now exists
	 * (PATCH /admin-request/mine/:id/withdraw), so this is false only while a
	 * withdrawal is already in flight.
	 */
	canCancel: boolean;
	quotePending: boolean;
	/**
	 * WHICH request is with the admin, so only that one action is blocked. A
	 * venue that asked for a new price must still be able to decide it would
	 * rather drop POS altogether — hiding both buttons left it with no way to
	 * say so until the admin happened to answer the other question.
	 */
	pendingKind: "requote" | "cancel" | null;
	contactLine: string;
	onRequestQuote: () => void;
	onCancelQuote: () => void;
}) {
	const { t } = usePortalLocale();
	const copy = addonCopy(addon.id, addon, t);
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
							<p className="iz-outlet-pos-addon__title">{copy.label}</p>
							<IzPill variant="violet" className="!py-0.5 !text-[10px]">
								{t.outletSubscription.addOn}
							</IzPill>
							{activeAddonPriceRm !== null && (
								<IzPill variant="green" className="!py-0.5 !text-[10px]">
									{t.outletSubscription.active}
								</IzPill>
							)}
							{/*
							 * The pending badge shows ALONGSIDE Active, not instead of it.
							 * A venue on POS that has asked for a re-quote or a cancellation
							 * is in both states at once, and the card previously showed only
							 * the first — so an open request was invisible unless you read
							 * the paragraph at the bottom.
							 */}
							{quotePending && (
								<IzPill variant="amber" className="!py-0.5 !text-[10px]">
									{pendingKind === "cancel"
										? t.outletSubscription.cancelPendingAdmin
										: activeAddonPriceRm !== null
											? t.outletSubscription.newPricePendingAdmin
											: t.outletSubscription.requestSentPendingAdmin}
								</IzPill>
							)}
						</div>
						<p className="iz-outlet-pos-addon__subtitle">
							{activeAddonPriceRm !== null
								? fill(t.outletSubscription.addonActiveSubtitle, {
										capacity: copy.capacityLabel,
										price: formatRM(activeAddonPriceRm),
									})
								: fill(t.outletSubscription.addonOfferSubtitle, {
										capacity: copy.capacityLabel,
										price: copy.priceLabel,
									})}
						</p>
						{activeAddonPriceRm !== null && windowLabel && renewsOn && (
							<p className="iz-outlet-pos-addon__subtitle">
								{fill(t.outletSubscription.windowRenewal, {
									window: windowLabel,
									date: renewsOn,
								})}
							</p>
						)}
					</div>
					<Sparkles className="h-5 w-5 shrink-0 text-[var(--iz-violet-l)] opacity-80" />
				</div>

				<p className="iz-outlet-pos-addon__lead">{copy.description}</p>

				<ul className="iz-outlet-pos-addon__features">
					{POS_FEATURES.map((feature) => (
						<li key={feature(t)}>
							<Check className="h-4 w-4 shrink-0 text-[var(--iz-green)]" />
							<span>{feature(t)}</span>
						</li>
					))}
				</ul>

				{activeAddonPriceRm !== null ? (
					<div className="iz-outlet-pos-addon__sent">
						<p className="iz-outlet-pos-addon__sent-title">
							{t.outletSubscription.posActive}
						</p>
						<p className="iz-outlet-pos-addon__sent-body">
							{fill(t.outletSubscription.posActiveBody, {
								price: formatRM(activeAddonPriceRm),
							})}
						</p>
						{/*
						 * Two ways out, and BOTH go to the admin: the venue can ask for the
						 * price to be quoted again, or drop POS entirely and keep its plan
						 * only. Neither takes effect until the admin answers — a venue must
						 * not be able to end its own billing.
						 */}
						{canEdit && (
							<>
								{quotePending && (
									<p className="iz-outlet-pos-addon__sent-body">
										{pendingKind === "cancel"
											? t.outletSubscription.cancelPendingBody
											: t.outletSubscription.requotePendingBody}
									</p>
								)}
								{/*
								 * Both ways out stay on screen while a request is open; only the
								 * one already asked for is disabled. Hiding both meant a venue
								 * that asked for a new price could not then decide to drop POS
								 * instead — it had to wait for an answer to a question it no
								 * longer wanted asked.
								 */}
								{requoteBlockedNote && !quotePending && (
									<p
										className="iz-outlet-pos-addon__sent-body"
										style={{ color: "var(--iz-amber)" }}
									>
										{requoteBlockedNote}
									</p>
								)}
								<div className="flex flex-col gap-2 sm:flex-row">
									{/* Gold = the act (it sends a request to the admin), red = the
									    way out (ends POS billing) — the owner's colour code, applied
									    2 Sep 2026 after both sat as plain soft buttons. */}
									<button
										type="button"
										className="iz-btn iz-btn-gold iz-outlet-pos-addon__cancel flex-1"
										disabled={
											pendingKind === "requote" || requoteBlockedNote !== null
										}
										onClick={onRequestQuote}
									>
										{pendingKind === "requote"
											? t.outletSubscription.newPriceRequested
											: t.outletSubscription.askForNewPrice}
									</button>
									<button
										type="button"
										className="iz-btn iz-btn-danger iz-outlet-pos-addon__cancel flex-1"
										disabled={pendingKind === "cancel"}
										onClick={onRemoveAddon}
									>
										{pendingKind === "cancel"
											? t.outletSubscription.cancelPosRequested
											: t.outletSubscription.cancelPosPlanOnly}
									</button>
								</div>
							</>
						)}
					</div>
				) : quotePending ? (
					<div className="iz-outlet-pos-addon__sent">
						<p className="iz-outlet-pos-addon__sent-title">
							{t.outletSubscription.adminNotified}
						</p>
						<p className="iz-outlet-pos-addon__sent-body">
							{fill(t.outletSubscription.adminNotifiedBody, {
								contact: contactLine,
							})}
						</p>
						{canEdit && canCancel && (
							<button
								type="button"
								className="iz-btn iz-btn-soft iz-outlet-pos-addon__cancel"
								onClick={onCancelQuote}
							>
								{t.outletSubscription.cancelRequest}
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
							{t.outletSubscription.requestAdminQuote}
						</button>
					)
				)}
			</div>
		</div>
	);
}

function OutletSubscriptionPage() {
	const { t, locale } = usePortalLocale();
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
	const toast = useStore((s) => s.toast);
	const can = useOutletCan();
	const isOrgOwner = useOutletIsOwner();
	const canEdit = can("editSettings");
	/*
	 * SPENDING IS NARROWER THAN EDITING. `canEdit` is `settings:update`,
	 * held by the owner AND the guarantor — right for the plan and the org’s
	 * details, wrong for money: "guarantor no payment made like other member
	 * just see paid and unpaid" (owner, 12 Sep 2026). This mirrors the
	 * server’s `orgOwnerPaysOnly`, which asks for the owner lane with the
	 * guarantor fold switched OFF.
	 */
	const canPay = canEdit && isOrgOwner;
	// Real login → backend billing ledger + real POS-quote create (see the hook).
	const backend = useOutletSubscription();

	// What this venue owes its AGENCY for PR work — a different creditor to the
	// InnocenZ subscription above. Read-only by design: settling is agency-side,
	// because the outlet is the one party with an interest in claiming it paid.
	const collections = useOutletCollections();
	const showCollections =
		SHOW_COLLECTIONS && collections.backed && can("viewBilling");
	const [quoteSentLocal, setQuoteSentLocal] = useState(false);
	// The cancellation's counterpart to the flag above — see `pendingKind`.
	const [removalSentLocal, setRemovalSentLocal] = useState(false);
	// Instant feedback for the tap; the server's answer (backend.pendingPlanLabel)
	// takes over as soon as it arrives and is what survives a refresh.
	const [planChangeRequestedLocal, setPlanChangeRequestedLocal] = useState<
		string | null
	>(null);
	const planChangeRequested = backend.backed
		? (backend.pendingPlanLabel ?? planChangeRequestedLocal)
		: null;

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
	 *
	 * The tag comes from the portal's language, not a hardcoded `en-GB`: this is
	 * a rendered label with nothing downstream parsing it. English still gets
	 * `en-GB`, so day-before-month ordering is unchanged. `RENEWAL_DATE`, the
	 * demo fallback, is a pre-formatted English constant and is left alone —
	 * localizing it would mean re-parsing a string that has no Date behind it.
	 */
	const renewalLabel = backend.backed
		? backend.nextRenewalDate
			? backend.nextRenewalDate.toLocaleDateString(dateLocaleTag(locale), {
					day: "numeric",
					month: "short",
					year: "numeric",
				})
			: null
		: RENEWAL_DATE;

	/**
	 * Each lane's CURRENT billing window, from that lane's own invoices (owner,
	 * 2 Sep 2026: "the date duration shows here"). The plan's month and the POS
	 * add-on's month can start on different days, and every venue's month runs
	 * from its own activation day, because the ledger is anchored there. Null on
	 * a demo session or before the first period is minted — then only the
	 * renewal prints, never a guessed range.
	 */
	const planWindowLabel =
		backend.backed && backend.planWindow
			? periodLabel(
					backend.planWindow.periodStart,
					backend.planWindow.periodEnd,
				)
			: null;
	const addonWindowLabel =
		backend.backed && backend.addonWindow
			? periodLabel(
					backend.addonWindow.periodStart,
					backend.addonWindow.periodEnd,
				)
			: null;
	const addonRenewalLabel =
		backend.backed && backend.addonRenewalDate
			? backend.addonRenewalDate.toLocaleDateString(dateLocaleTag(locale), {
					day: "numeric",
					month: "short",
					year: "numeric",
				})
			: null;

	/**
	 * WHY "Ask for a new price" is refused, said ON THE CARD (owner, 2 Sep 2026:
	 * pressed it, saw nothing, asked where the status was). The rule is the
	 * owner's own — a re-quote waits until every billing period is paid — and
	 * `handleRequestQuote` enforced it with a toast that had vanished by the
	 * time anyone looked. Null when the ask is allowed.
	 */
	const requoteBlockedNote = useMemo(() => {
		if (!backend.backed || backend.addonAmountRm === null) return null;
		const owing = backend.paymentHistory.filter(
			(invoice) => invoice.status !== "paid",
		);
		if (owing.length === 0) return null;
		const cents = owing.reduce(
			(total, invoice) => total + Math.round(Number(invoice.amount) * 100),
			0,
		);
		return fill(t.outletSubscription.settleBeforeRequote, {
			amount: formatRM(cents / 100),
			n: countBillingWindows(owing),
		});
	}, [backend.backed, backend.addonAmountRm, backend.paymentHistory, t]);

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
		? backend.posQuotePending || quoteSentLocal || removalSentLocal
		: posQuotePending;

	/**
	 * Which of the two requests is open. The server's answer wins as soon as it
	 * arrives — the local flags only cover the moment between the tap and the
	 * refetch, and only the tapped action is blocked, never both.
	 */
	const pendingKind: "requote" | "cancel" | null = backend.backed
		? (backend.posRequestKind ??
			(removalSentLocal ? "cancel" : quoteSentLocal ? "requote" : null))
		: posQuotePending
			? "requote"
			: null;

	/**
	 * The unpaid REMINDER for POS actions — a nudge, never a gate.
	 *
	 * Owner's two rulings, held together: "add on pos and cancel can do
	 * anytime" (so nothing here returns early) and "this need pop out" (so the
	 * outstanding figure is still said out loud when they act). Switching plans
	 * is the one action that BLOCKS; POS asks, re-quotes and cancels proceed
	 * with the debt stated beside them.
	 */
	const remindUnpaidPos = () => {
		if (!backend.backed) return;
		const owing = backend.paymentHistory.filter(
			(invoice) => invoice.status !== "paid",
		);
		if (owing.length === 0) return;
		const cents = owing.reduce(
			(total, invoice) => total + Math.round(Number(invoice.amount) * 100),
			0,
		);
		toast(
			fill(t.outletSubscription.unpaidReminderPos, {
				amount: formatRM(cents / 100),
				n: countBillingWindows(owing),
			}),
			"warn",
		);
	};

	const handleRequestQuote = () => {
		/**
		 * RE-QUOTE BLOCKS, first ask does not. Owner's final split: "outlet POS
		 * ask new price need pay the unpaid" — but the INITIAL add-on ask and
		 * cancelling stay "anytime". An active add-on is what makes this press a
		 * re-quote rather than a first ask.
		 */
		if (backend.backed && backend.addonAmountRm !== null) {
			const owing = backend.paymentHistory.filter(
				(invoice) => invoice.status !== "paid",
			);
			if (owing.length > 0) {
				const cents = owing.reduce(
					(total, invoice) => total + Math.round(Number(invoice.amount) * 100),
					0,
				);
				toast(
					fill(t.outletSubscription.settleBeforeRequote, {
						amount: formatRM(cents / 100),
						n: countBillingWindows(owing),
					}),
					"warn",
				);
				return;
			}
		}
		remindUnpaidPos();
		if (backend.backed) {
			backend
				.requestPosQuote({
					email: outletOwner.email,
					phone: outletOwner.mobile,
				})
				.then(() => {
					setQuoteSentLocal(true);
					toast(
						backend.addonAmountRm !== null
							? t.outletSubscription.newPriceRequestedToast
							: t.outletSubscription.posRequestSent,
						"success",
					);
				})
				.catch(() => toast(t.outletSubscription.couldNotSendRequest, "warn"));
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
		remindUnpaidPos();
		backend
			.requestPosRemoval()
			.then((filed) => {
				// Same reason as the quote's local flag: hold the state for the moment
				// between the tap and the server's answer, so the button cannot be
				// pressed twice into two identical requests.
				if (filed) setRemovalSentLocal(true);
				toast(
					filed
						? t.outletSubscription.posRemovalSent
						: t.outletSubscription.couldNotSendTheRequest,
					filed ? "success" : "warn",
				);
			})
			.catch(() => toast(t.outletSubscription.couldNotSendTheRequest, "warn"));
	};

	const handleCancelQuote = () => {
		if (backend.backed) {
			/**
			 * A REAL withdrawal now. This used to clear `quoteSentLocal` and toast
			 * "withdrawn" while the admin still held the request — the badge went, the
			 * request stayed, and the venue was told the opposite of what happened.
			 *
			 * The local flags are cleared only on the server's confirmation, and the
			 * hook refetches the quote so the card's state comes from the ledger
			 * rather than from this component's memory.
			 */
			backend
				.withdrawPosRequest()
				.then((ok) => {
					if (ok) {
						setQuoteSentLocal(false);
						setRemovalSentLocal(false);
					}
					toast(
						ok
							? t.outletSubscription.posRequestWithdrawn
							: t.outletSubscription.couldNotWithdrawRequest,
						ok ? "info" : "warn",
					);
				})
				.catch(() =>
					toast(t.outletSubscription.couldNotWithdrawRequest, "warn"),
				);
			return;
		}
		cancelPosIntegrationQuoteRequest();
	};

	const todayIso = isoKeyFromDate(new Date());
	// THE SAME LIST POST JOB COUNTS. On a real session the demo `shifts` store
	// is empty, so counting it here showed "0 / 50 requested PRs today" while
	// Post Job — reading the real bookings — said 49 named slots were left. One
	// outlet, two answers (owner, 20 Aug 2026). Count the real bookings.
	const { backed: postJobBacked, bookedShifts } = useOutletPostJob();
	const capShifts = postJobBacked ? bookedShifts : shifts;
	const namedPrsToday = useMemo(
		() => outletNamedPrCountForDate(capShifts, outletName, todayIso),
		[capShifts, outletName, todayIso],
	);
	const peakDailyNamedPrs = useMemo(
		() => maxDailyOutletNamedPrCount(capShifts, outletName),
		[capShifts, outletName],
	);

	const selectPlan = (planId: OutletSubscriptionPlanId) => {
		if (!canEdit || planId === currentPlan?.id) return;
		const next = getOutletSubscriptionPlan(planId);
		if (next.renegotiate) return;
		if (peakDailyNamedPrs > next.prPerDayMax) {
			toast(
				fill(t.outletSubscription.peakDayReduce, {
					peak: peakDailyNamedPrs,
					max: next.prPerDayMax,
					plan: next.label,
				}),
				"warn",
			);
			return;
		}
		// A real session must not switch itself: the venue files a plan_change
		// request and stays on its current plan until an admin approves, which is
		// what writes the billing ledger. Only the demo store flips instantly.
		if (backend.backed) {
			/**
			 * THE OWNER'S RULE, said BEFORE the server says it: unpaid → no
			 * switch. The server refuses the filing anyway (the admin-request
			 * gate answers 409), but that reads as a failure after the fact —
			 * this pops the same message the moment the venue presses Switch,
			 * with the figure that settles it. POS add-on asks, re-quotes and
			 * cancels are deliberately NOT gated — owner: "add on pos and
			 * cancel can do anytime".
			 */
			const owing = backend.paymentHistory.filter(
				(invoice) => invoice.status !== "paid",
			);
			if (owing.length > 0) {
				const cents = owing.reduce(
					(sum, invoice) => sum + Math.round(Number(invoice.amount) * 100),
					0,
				);
				toast(
					fill(t.outletSubscription.settleBeforeSwitch, {
						amount: formatRM(cents / 100),
						n: countBillingWindows(owing),
					}),
					"warn",
				);
				return;
			}
			if (!backend.planCatalogReady) {
				toast(t.outletSubscription.planListLoading, "warn");
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
							result.reason ?? t.outletSubscription.couldNotSendSwitch,
							"warn",
						);
						return;
					}
					setPlanChangeRequestedLocal(next.label);
					toast(
						fill(t.outletSubscription.switchSentToAdmin, { plan: next.label }),
						"success",
					);
				});
			return;
		}
		saveOutletOwner({ subscriptionPlanId: planId });
		recordOutletSubscriptionPlanChange(planId);
		toast(
			fill(t.outletSubscription.switchedTo, {
				plan: next.label,
				price: formatRM(next.monthlyRm),
				capacity: planCapacityLabel("outlet", next.id, next.capacityLabel, t),
				rule: outletPickerRule(next, t),
			}),
			"success",
		);
	};

	if (!can("viewSettings")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.outletSettings.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						{t.outletSubscription.noAccessBilling}
					</p>
				</IzCard>
			</div>
		);
	}

	const isFinanceReadOnly = outletSubRole === "outlet_finance";

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>{t.nav.subscription}</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">{outletOwner.orgName}</p>
				{/*
				 * `!canEdit`, not one named lane. Ops Head and Director also lose
				 * the plan switch, the Pay button and the payment method, and used
				 * to be given no reason for any of it — a page with its controls
				 * quietly missing reads as broken rather than as a rule.
				 */}
				{!canEdit && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						{isFinanceReadOnly
							? t.outletSubscription.financeReadOnly
							: t.outletSubscription.memberReadOnly}
					</p>
				)}
			</header>

			<IzSectionLabel>{t.outletSubscription.plansMonthly}</IzSectionLabel>
			<p className="iz-tiny iz-muted2 -mt-1 mb-2">
				{fill(t.outletSubscription.prLimitHint, {
					today: namedPrsToday,
					peak: peakDailyNamedPrs,
				})}
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
										<p className="iz-heading text-sm font-bold">{plan.label}</p>
										{isCurrent && (
											<IzPill variant="green">
												{t.outletSubscription.current}
											</IzPill>
										)}
										{planChangeRequested === plan.label && !isCurrent && (
											<IzPill variant="violet">
												{t.outletSubscription.awaitingAdmin}
											</IzPill>
										)}
										{atCapacity && !isCurrent && (
											<IzPill variant="amber">
												{t.outletSubscription.atDailyLimit}
											</IzPill>
										)}
									</div>
									<p className="mt-1 text-lg font-bold text-[var(--iz-gold-l)]">
										{formatRM(plan.monthlyRm)}
										<span className="iz-tiny iz-muted font-normal">
											{" "}
											{t.outletSubscription.perMonth}
										</span>
									</p>
								</div>
								<div className="shrink-0 sm:text-right">
									<div className="flex items-center gap-1.5 text-[var(--iz-txt)] sm:justify-end">
										<Users className="h-4 w-4 text-[var(--iz-gold)]" />
										<span className="iz-heading text-sm font-bold">
											{planCapacityLabel(
												"outlet",
												plan.id,
												plan.capacityLabel,
												t,
											)}
										</span>
									</div>
									<p className="iz-tiny iz-muted mt-0.5">
										{outletPickerRule(plan, t)}
									</p>
								</div>
							</div>
							{isCurrent ? (
								<p className="iz-tiny iz-muted2 mt-2">
									{planWindowLabel && renewalLabel
										? fill(t.outletSubscription.windowRenewalPrefix, {
												window: planWindowLabel,
												date: renewalLabel,
											})
										: renewalLabel
											? fill(t.outletSubscription.renewalPrefix, {
													date: renewalLabel,
												})
											: ""}
									{fill(t.outletSubscription.requestedTodayPool, {
										today: namedPrsToday,
										max: plan.prPerDayMax,
										pool: plan.prPoolSize,
									})}
								</p>
							) : (
								canEdit &&
								(planChangeRequested === plan.label ? (
									<p className="iz-tiny iz-muted2 mt-3">
										{fill(t.outletSubscription.sentToAdmin, {
											plan:
												currentPlan?.label ??
												t.outletSubscription.yourCurrentPlan,
										})}
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
										{backend.isLoading
											? t.common.loading
											: fill(t.outletSubscription.switchTo, {
													plan: plan.label,
												})}
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
						// `canEdit`, not `canPay`: asking for a POS quote is an ORG change,
						// which the guarantor may make. Only spending is owner-only.
						canEdit={canEdit}
						// Real sessions can withdraw too now: PATCH
						// /admin-request/mine/:id/withdraw exists, so the button no longer
						// clears a badge the admin's queue disagrees with. Still false
						// while the withdrawal is in flight, so it cannot be double-sent.
						canCancel={!backend.isWithdrawingPos}
						quotePending={quotePending}
						pendingKind={pendingKind}
						activeAddonPriceRm={backend.addonAmountRm}
						windowLabel={addonWindowLabel}
						renewsOn={addonRenewalLabel}
						requoteBlockedNote={requoteBlockedNote}
						contactLine={contactLine}
						onRequestQuote={handleRequestQuote}
						onCancelQuote={handleCancelQuote}
						onRemoveAddon={handleRemoveAddon}
					/>
				))}
			</div>

			{backend.backed && (
				<>
					<IzSectionLabel>{t.outletSubscription.paymentHistory}</IzSectionLabel>
					<p className="iz-tiny iz-muted2 -mt-1 mb-2">
						{t.outletSubscription.oneRowPerPeriod}
					</p>
					<PaymentHistoryList
						invoices={backend.paymentHistory}
						isLoading={backend.isPaymentHistoryLoading}
						// A venue can hold two lanes at once — its plan and the POS add-on
						// — and is billed on both every month, so each row says which it
						// is. The agency screen passes nothing: one lane, no badge needed.
						laneOf={backend.invoiceLane}
						/*
						 * The LIST stays readable for everyone; only the spending does
						 * not. `canEdit` is `settings:update`, which the database grants
						 * to the owner and the guarantor alone — the same two the server
						 * now admits to `POST /subscription-payment/checkout`.
						 */
						canPay={canPay}
					/>
				</>
			)}

			{showCollections && (
				<>
					<IzSectionLabel>{t.outletSubscription.prWorkOwed}</IzSectionLabel>
					<p className="iz-tiny iz-muted2 -mt-1 mb-2">
						{t.outletSubscription.prWorkOwedBody}
					</p>

					<IzCard>
						<div className="grid grid-cols-3 gap-2 text-center">
							<div>
								<p className="iz-tiny iz-muted2">
									{t.outletSubscription.owedNow}
								</p>
								<p className="mt-1 iz-heading text-base font-bold text-[var(--iz-gold-l)]">
									{formatRM(collections.totals.owedRm)}
								</p>
							</div>
							<div>
								<p className="iz-tiny iz-muted2">
									{t.outletSubscription.overdue}
								</p>
								<p
									className={`mt-1 iz-heading text-base font-bold ${
										collections.totals.overdueRm > 0
											? "text-[var(--iz-red-l,#ff8080)]"
											: ""
									}`}
								>
									{formatRM(collections.totals.overdueRm)}
								</p>
							</div>
							<div>
								<p className="iz-tiny iz-muted2">{t.outletSubscription.paid}</p>
								<p className="mt-1 iz-heading text-base font-bold">
									{formatRM(collections.totals.settledRm)}
								</p>
							</div>
						</div>
						{collections.totals.overdueRm > 0 && (
							<p className="iz-tiny iz-muted mt-3 border-t border-[var(--iz-line)] pt-2">
								{t.outletSubscription.overduePartOfOwed}
							</p>
						)}
						{collections.hasMultipleAgencies && (
							<p className="iz-tiny iz-muted mt-2">
								{t.outletSubscription.multipleAgencies}
							</p>
						)}
					</IzCard>

					<div className="mt-3 space-y-2">
						{collections.isLoading ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted py-4 text-center">
									{t.outletSubscription.loadingStatements}
								</p>
							</IzCard>
						) : collections.invoices.length === 0 ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted py-4 text-center">
									{t.outletSubscription.noStatements}
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
														{fill(t.outletSubscription.prWorkWeek, {
															week: collectionWeekLabel(
																inv.weekStart,
																inv.weekEnd,
															),
														})}
													</p>
													<p className="iz-tiny iz-muted">
														{fill(
															inv.sourceAssignmentIds.length === 1
																? t.outletSubscription.completedShiftOne
																: t.outletSubscription.completedShiftMany,
															{ n: inv.sourceAssignmentIds.length },
														)}
														{inv.settledAt
															? fill(t.outletSubscription.markedReceived, {
																	date: collectionStampLabel(inv.settledAt),
																})
															: inv.issuedAt
																? fill(t.outletSubscription.issuedOn, {
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
												{inv.status === "settled" ? (
													<IzPill variant="green" className="!mt-1">
														{t.outletSubscription.received}
													</IzPill>
												) : aging ? (
													<IzPill variant={aging.variant} className="!mt-1">
														{aging.label(t)}
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

			{/*
			 * THE WHOLE SECTION, not just its Edit button.
			 *
			 * Owner, 11 Sep 2026: "only the owner can make payment and SEE the
			 * payment method in the organisation." It used to render for every
			 * lane with only the edit form behind `canEdit`, so a Finance head
			 * read the saved instrument — brand, last four, expiry and holder —
			 * in the collapsed hint without even opening it.
			 */}
			{canEdit && (
				<OutletSection
					title={t.agencyMisc.paymentMethod}
					iconKey="Payment method"
					hint={
						backend.backed
							? backend.card
								? // The instrument stamp comes from the one shared describer, so a
									// bank transfer reads as "Bank transfer" rather than
									// "Card ···· ····". The renewal tail is unchanged.
									describePaymentMethod(backend.card, {
										transfer: t.subscription.savedTransfer,
										fpx: t.subscription.savedFpx,
										fpxLink: t.subscription.savedFpxLink,
										ewallet: t.subscription.methodEwallet,
									}) +
									(renewalLabel
										? fill(
												// Same rule as the agency page: only a rail that can
												// actually be charged says "next charge".
												willAutoCharge(backend.card)
													? t.agencyMisc.nextChargeSuffix
													: t.agencyMisc.renewsOnSuffix,
												{ date: renewalLabel },
											)
										: "")
								: t.subscription.noCardSavedYet
							: fill(t.outletSubscription.demoCardHint, {
									last4: paymentCardLast4,
									date: RENEWAL_DATE,
								})
					}
					collapsible
					defaultOpen={false}
					className="!mt-5"
				>
					<PaymentMethodCard
						card={backend.backed ? backend.card : null}
						backed={backend.backed}
						demoLast4={paymentCardLast4}
						canEdit={canPay}
						isLoading={backend.backed && backend.isCardLoading}
						isSaving={backend.isSavingCard}
						billedLabel={
							currentPlan
								? fill(t.outletSubscription.billedMonthly, {
										price: formatRM(currentPlan.monthlyRm),
									})
								: "—"
						}
						onSave={async (input) => {
							const result = await backend.saveCard(input);
							toast(
								result.ok
									? t.outletSubscription.cardSaved
									: (result.reason ?? t.outletSubscription.couldNotSaveCard),
								result.ok ? "success" : "warn",
							);
							return result.ok;
						}}
						isRemoving={backend.isRemovingCard}
						onRemove={async () => {
							const result = await backend.removeCard();
							// The server's own sentence first; the local one only if it sent none.
							toast(
								result.message ??
									(result.ok
										? t.subscription.methodRemoved
										: t.subscription.couldNotRemoveMethod),
								result.ok ? "success" : "warn",
							);
							return result.ok;
						}}
					/>

					<div className="iz-tiny iz-muted mt-2 flex items-center gap-2">
						<Calendar className="h-3.5 w-3.5" />
						{renewalLabel
							? fill(t.outletSubscription.nextRenewal, { date: renewalLabel })
							: t.outletSubscription.nothingToRenew}
					</div>
				</OutletSection>
			)}
		</div>
	);
}
