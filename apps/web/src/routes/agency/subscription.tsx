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
import { agencyCan } from "@agency-portal/lib/agency-rbac";
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
import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
	Building2,
	Calendar,
	CreditCard,
	Receipt,
	TriangleAlert,
	Users,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

const CARD_LAST4 = "4242";

export const Route = createFileRoute("/agency/subscription")({
	component: AgencySubscription,
});

function AgencySubscription() {
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
	const canEdit = agencyCan(agencySubRole, "editSettings");

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
		() => agencySubscriptionBillingForWeeklyPv(issuedWeeklyPv),
		[issuedWeeklyPv],
	);

	// Real login → rate card lists real backend plans; demo plans otherwise. The
	// usage-based hero tier stays demo (no backend equivalent).
	const sub = useAgencySubscription();

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
				statusLabel: c.status === "SETTLED" ? "Paid" : c.status,
				tone: c.status === "SETTLED" ? "green" : "amber",
			}));
	}, [sub.backed, sub.billingHistory, agencyCollections]);

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
	 *  • on Custom but back inside the rate card → ask the admin to end Custom.
	 *    Still a request: an agency's own PV count must not end a negotiated
	 *    price by itself.
	 *
	 * Guarded hard, because this WRITES: only for a real session, only once the
	 * real PV count and the plan catalog have loaded, never while a request is
	 * already open, and at most once per mount.
	 */
	const autoTierFiled = useRef(false);
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
						? `${pv} PV this week — InnocenZ admin notified to negotiate your Custom price`
						: (r.reason ?? "Could not notify InnocenZ admin — try again"),
					r.ok ? "success" : "warn",
				);
			});
			return;
		}

		if (!needsCustom && sub.onCustom) {
			autoTierFiled.current = true;
			sub.requestLeaveCustom(banded.label, pv).then((r) => {
				toast(
					r.ok
						? `${pv} PV this week is back inside the rate card — asked InnocenZ admin to move you to ${banded.label}`
						: (r.reason ?? "Could not send the request — try again"),
					r.ok ? "success" : "warn",
				);
			});
			return;
		}

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
						`${pv} PV this week — your tier is now ${banded.label}`,
						"success",
					);
				}
			});
		}
	}, [sub, canEdit, waitingOn, toast]);

	if (!agencyCan(agencySubRole, "viewSettings")) {
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
	const billedPriceLabel = sub.backed
		? sub.currentAmountRm
			? formatRM(sub.currentAmountRm)
			: sub.onCustom
				? "Awaiting price"
				: billing.priceLabel
		: billing.priceLabel;

	/**
	 * Leave Custom and go back to the banded rate card.
	 *
	 * The ONLY thing an agency can do to its own tier by hand. It is still a
	 * REQUEST — the admin resolving it is what moves the ledger — because an
	 * agency must not be able to end a price a human negotiated. Re-negotiating
	 * is not offered here at all: that is the volume rule's job when the week's
	 * PVs go past the rate card.
	 */
	const handleResetToNormal = () => {
		const pv = sub.weeklyPvCount ?? 0;
		const banded = resolveAgencySubscriptionPlanForWeeklyPv(pv);
		sub.requestLeaveCustom(banded.label, pv).then((result) => {
			toast(
				result.ok
					? `Reset off Custom — you are on ${banded.label} now`
					: (result.reason ?? "Could not send the request — try again"),
				result.ok ? "success" : "warn",
			);
		});
	};

	// Not `editSettings`: finance is read-only for the card above but is exactly
	// the role that chases receivables, and it holds both of these.
	const showCollections =
		collections.backed && agencyCan(agencySubRole, "viewCollections");
	const canManageCollections = agencyCan(
		agencySubRole,
		"confirmReconciliation",
	);

	// Both report the server's own message. Settling says it records the agency's
	// claim rather than verifying payment, and a friendlier client-side string
	// would overstate what the app actually saw.
	const handleIssue = async (id: string, outletName: string) => {
		try {
			const res = await collections.issue(id);
			toast(res.message || `Invoice issued to ${outletName}`, "success");
		} catch {
			toast(
				`Could not issue ${outletName}'s invoice — nothing was sent`,
				"warn",
			);
		}
	};

	const handleSettle = async (id: string, outletName: string) => {
		try {
			const res = await collections.settle(id);
			toast(res.message || `${outletName} marked settled`, "success");
		} catch {
			toast(
				`Could not update ${outletName}'s invoice — status unchanged`,
				"warn",
			);
		}
	};

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>Subscription</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">{agencyOwner.orgName}</p>
				{isFinanceReadOnly && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						Finance view — read-only · contact owner to update card
					</p>
				)}
			</header>

			<IzSectionLabel>Usage-based · weekly</IzSectionLabel>
			<IzCard className="border-[rgba(57,217,138,.35)] bg-[rgba(57,217,138,.06)]">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="iz-tiny iz-muted2">
							Last payroll week · {payrollWeek.cycle}
						</p>
						<p className="mt-1 font-sora text-base font-bold">
							{issuedWeeklyPv} PV{issuedWeeklyPv === 1 ? "" : "s"} issued
						</p>
						<p className="iz-tiny iz-muted mt-1">
							{sub.backed && sub.onCustom
								? "Custom is priced by InnocenZ admin — PV volume does not change it"
								: "Tier auto-selected from weekly PV volume — no plan changes needed"}
						</p>
					</div>
					<div className="text-right shrink-0">
						<IzPill variant="green">{billedTierLabel}</IzPill>
						<p className="mt-2 text-lg font-bold text-[var(--iz-gold-l)]">
							{billedPriceLabel}
						</p>
						<p className="iz-tiny iz-muted2 mt-0.5">
							{billing.plan.capacityLabel}
						</p>
					</div>
				</div>
				<p className="iz-tiny iz-muted2 mt-3 border-t border-[var(--iz-line)] pt-2">
					Next weekly charge {renewalDate}
					{sub.backed && sub.onCustom
						? " · at the price agreed with InnocenZ admin"
						: billing.plan.renegotiate
							? " · contact InnocenZ admin for custom pricing"
							: ` · ${billedPriceLabel} based on ${issuedWeeklyPv} PV${issuedWeeklyPv === 1 ? "" : "s"}`}
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
					<IzSectionLabel>Negotiated tier</IzSectionLabel>
					<IzCard className="border-[rgba(139,124,246,.35)] bg-[rgba(139,124,246,.06)]">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-sora text-base font-bold">Custom</p>
									<IzPill variant="violet">Negotiated</IzPill>
									{/* Amber, and alongside — an agency on Custom with an open
									    request is in both states at once. */}
									{waitingOn && (
										<IzPill variant="amber">Price · pending admin</IzPill>
									)}
								</div>
								<p className="iz-tiny iz-muted mt-1">
									Priced for your agency by InnocenZ admin — it replaces the
									rate card, so PV volume does not change what you pay.
								</p>
							</div>
							<p className="shrink-0 text-lg font-bold text-[var(--iz-gold-l)]">
								{sub.customAmountRm
									? formatRM(sub.customAmountRm)
									: "Awaiting price"}
							</p>
						</div>
						{canEdit && (
							<>
								{waitingOn && (
									<p className="iz-tiny iz-muted mt-3 border-t border-[var(--iz-line)] pt-2">
										InnocenZ admin is negotiating your Custom price — nothing
										changes until they answer.
									</p>
								)}
								{/*
								 * ONE action, deliberately: reset back to the rate card. There is
								 * no "renegotiate" button because re-pricing is not the agency's
								 * call — the volume rule raises that when the week's PVs pass the
								 * rate card — and no "cancel", because an agency cannot end a
								 * negotiated price by itself. This asks; the admin decides.
								 */}
								<div className="mt-3 flex flex-col gap-2 border-t border-[var(--iz-line)] pt-3 sm:flex-row">
									<button
										type="button"
										className="iz-btn iz-btn-soft flex-1"
										disabled={sub.isRequesting}
										onClick={handleResetToNormal}
									>
										Reset to normal subscription
									</button>
									<p className="iz-tiny iz-muted2 flex-1 self-center">
										Puts you back on the tier your weekly PVs fall into,
										straight away. InnocenZ admin sees it in Plan Request.
									</p>
								</div>
							</>
						)}
					</IzCard>
				</>
			)}

			<IzSectionLabel>Rate card</IzSectionLabel>
			<p className="iz-tiny iz-muted2 -mt-1 mb-2">
				{sub.backed
					? "Your tier is chosen by the PVs you issue each payroll week — there is nothing to pick. Past 150 PV the rate card runs out and InnocenZ admin is notified to negotiate a Custom price."
					: "Reference tiers — your charge each week follows PVs issued in that payroll week"}
			</p>
			{sub.backed && waitingOn && (
				<IzCard flat className="!mb-2">
					<p className="iz-tiny iz-muted">
						Waiting for InnocenZ admin — {waitingOn}. Nothing changes on your
						account until they answer.
					</p>
				</IzCard>
			)}
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
							: "Renegotiate Price");
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
										{isBilledTier && <IzPill variant="green">Your tier</IzPill>}
									</div>
									<p className="mt-1 text-lg font-bold text-[var(--iz-gold-l)]">
										{priceDisplay}
										{!plan.priceLabel && plan.weeklyRm != null && (
											<span className="iz-tiny iz-muted font-normal">
												/Week
											</span>
										)}
									</p>
								</div>
								<div className="shrink-0 sm:text-right">
									<div className="flex items-center gap-1.5 text-[var(--iz-txt)] sm:justify-end">
										<Users className="h-4 w-4 text-[var(--iz-gold)]" />
										<span className="font-sora text-sm font-bold">
											{plan.capacityLabel}
										</span>
									</div>
								</div>
							</div>
							<p className="iz-tiny iz-muted mt-2">{plan.description}</p>
						</IzCard>
					);
				})}
			</div>

			<IzSectionLabel>
				{sub.backed ? "Subscription record" : "Billing history"}
			</IzSectionLabel>
			{sub.backed && (
				<p className="iz-tiny iz-muted2 -mt-1 mb-2">
					Your plan history with InnocenZ — one row per subscription, not per
					charge. It records what you subscribed to and when, so it does not say
					whether a given week was paid.
				</p>
			)}
			<div className="space-y-2">
				{sub.backed && sub.isHistoryLoading ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted text-center py-4">
							Loading subscription record…
						</p>
					</IzCard>
				) : billingHistory.length === 0 ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted text-center py-4">
							{sub.backed
								? "No subscription on record for this agency yet."
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
										<p className="iz-sm font-semibold truncate">{row.title}</p>
										<p className="iz-tiny iz-muted">
											{row.dateLabel}
											{row.detail ? ` · ${row.detail}` : ""}
										</p>
									</div>
								</div>
								<div className="text-right shrink-0">
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
					<IzSectionLabel>Collections · owed to you by outlets</IzSectionLabel>
					<p className="iz-tiny iz-muted2 -mt-1 mb-2">
						Money coming in, not the subscription above — one statement per
						outlet per week, drafted from completed shifts. InnocenZ does not
						move this money; you and the outlet settle it between yourselves.
					</p>

					<IzCard>
						<div className="grid grid-cols-3 gap-2 text-center">
							<div>
								<p className="iz-tiny iz-muted2">Outstanding</p>
								<p className="mt-1 font-sora text-base font-bold text-[var(--iz-gold-l)]">
									{formatRM(collections.totals.outstandingRm)}
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
								<p className="iz-tiny iz-muted2">Settled</p>
								<p className="mt-1 font-sora text-base font-bold">
									{formatRM(collections.totals.settledRm)}
								</p>
							</div>
						</div>
						{collections.totals.overdueRm > 0 && (
							<p className="iz-tiny iz-muted mt-3 flex items-center gap-1.5 border-t border-[var(--iz-line)] pt-2">
								<TriangleAlert className="h-3.5 w-3.5 shrink-0" />
								Overdue is part of outstanding, not on top of it
							</p>
						)}
					</IzCard>

					{collections.drafts.length > 0 && (
						<>
							<p className="iz-tiny iz-muted2 mt-3 mb-1">
								Drafts · {formatRM(collections.totals.draftRm)} · no outlet has
								been shown these yet
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
														{inv.sourceAssignmentIds.length} shift
														{inv.sourceAssignmentIds.length === 1 ? "" : "s"}
													</p>
												</div>
											</div>
											<div className="shrink-0 text-right">
												<p className="iz-sm font-bold">
													{formatRM(collectionAmountRm(inv))}
												</p>
												{canManageCollections && (
													<button
														type="button"
														className="iz-btn iz-btn-soft mt-1.5 !py-1 !text-[11px]"
														disabled={collections.isMutating}
														onClick={() => handleIssue(inv.id, inv.outletName)}
													>
														Issue
													</button>
												)}
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
									Loading collections…
								</p>
							</IzCard>
						) : collections.invoices.length === 0 ? (
							<IzCard flat>
								<p className="iz-tiny iz-muted text-center py-4">
									No collections yet — the Monday payout job drafts these from
									the previous week's completed shifts.
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
															? ` · settled ${collectionStampLabel(inv.settledAt)}`
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
												<div className="mt-1 flex items-center justify-end gap-1.5">
													{inv.status === "settled" ? (
														<IzPill variant="green">Settled</IzPill>
													) : aging ? (
														<IzPill variant={aging.variant}>
															{aging.label}
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
														Mark settled
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
				title="Payment method"
				hint={`Visa ···· ${CARD_LAST4} · next charge ${renewalDate}`}
				collapsible
				defaultOpen={false}
				className="!mt-5"
			>
				<IzCard flat>
					<div className="flex items-center gap-2">
						<CreditCard className="h-4 w-4 text-[var(--iz-muted)]" />
						<div>
							<p className="iz-sm font-semibold">Visa ···· {CARD_LAST4}</p>
							<p className="iz-tiny iz-muted">
								Billed weekly from PV usage · current tier {billing.plan.label}{" "}
								· {billing.priceLabel} · auto-renew
							</p>
						</div>
					</div>
					{canEdit && (
						<button
							type="button"
							className="iz-btn iz-btn-soft mt-3 w-full"
							onClick={() =>
								toast("Card updated for subscription billing", "success")
							}
						>
							Update card
						</button>
					)}
				</IzCard>

				<div className="mt-2 flex items-center gap-2 iz-tiny iz-muted">
					<Calendar className="h-3.5 w-3.5" />
					Next weekly charge {renewalDate}
				</div>
			</OutletSection>
		</div>
	);
}
