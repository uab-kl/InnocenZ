import {
	formatRM,
	IzCard,
	IzPageTitle,
	IzPill,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import {
	collectionAmountRm,
	useAgencyCollections,
} from "@agency-portal/hooks/use-agency-collections";
import {
	type AgencyRatePlan,
	useAgencySubscription,
} from "@agency-portal/hooks/use-agency-subscription";
import {
	AGENCY_SUBSCRIPTION_PLANS,
	agencySubscriptionBillingForWeeklyPv,
	agencyWeeklyPvCount,
	scopeToAgency,
} from "@agency-portal/lib/agency-demo";
import { getAgencyManagedPvs } from "@agency-portal/lib/agency-payroll";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import { getPreviousWeekSundayIso } from "@agency-portal/lib/demo-clock";
import {
	demoPayrollWeekBoundsForWeeksAgo,
	demoPvIssueIsoForWeeksAgo,
} from "@agency-portal/lib/pr-demo";
import { useStore } from "@agency-portal/lib/store";
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
import { useEffect, useMemo } from "react";

const CARD_LAST4 = "4242";

/** "20–26 Jul 2026", collapsing the month when both ends share one. */
function weekLabel(startIso: string, endIso: string): string {
	const start = parseISO(startIso);
	const end = parseISO(endIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return `${startIso} – ${endIso}`;
	}
	return start.getMonth() === end.getMonth()
		? `${format(start, "d")}–${format(end, "d MMM yyyy")}`
		: `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
}

const AGING_PILL: Record<
	string,
	{ variant: "green" | "amber" | "red"; label: string }
> = {
	current: { variant: "green", label: "Current" },
	due_soon: { variant: "amber", label: "Due soon" },
	overdue: { variant: "red", label: "Overdue" },
};

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

	const billingHistory = useMemo(
		() =>
			agencyCollections.filter(
				(c) =>
					c.kind === "agency" &&
					c.lines.some((line) =>
						line.label.toLowerCase().includes("subscription"),
					),
			),
		[agencyCollections],
	);

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
							Tier auto-selected from weekly PV volume — no plan changes needed
						</p>
					</div>
					<div className="text-right shrink-0">
						<IzPill variant="green">{billing.plan.label}</IzPill>
						<p className="mt-2 text-lg font-bold text-[var(--iz-gold-l)]">
							{billing.priceLabel}
						</p>
						<p className="iz-tiny iz-muted2 mt-0.5">
							{billing.plan.capacityLabel}
						</p>
					</div>
				</div>
				<p className="iz-tiny iz-muted2 mt-3 border-t border-[var(--iz-line)] pt-2">
					Next weekly charge {renewalDate}
					{billing.plan.renegotiate
						? " · contact InnocenZ admin for custom pricing"
						: ` · ${billing.priceLabel} based on ${issuedWeeklyPv} PV${issuedWeeklyPv === 1 ? "" : "s"}`}
				</p>
			</IzCard>

			<IzSectionLabel>Rate card</IzSectionLabel>
			<p className="iz-tiny iz-muted2 -mt-1 mb-2">
				Reference tiers — your charge each week follows PVs issued in that
				payroll week
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

			<IzSectionLabel>Billing history</IzSectionLabel>
			<div className="space-y-2">
				{billingHistory.length === 0 ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted text-center py-4">
							No subscription invoices yet.
						</p>
					</IzCard>
				) : (
					billingHistory.map((inv) => (
						<IzCard key={inv.id} flat>
							<div className="iz-between gap-2">
								<div className="flex min-w-0 items-start gap-2">
									<Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
									<div className="min-w-0">
										<p className="iz-sm font-semibold truncate">
											{inv.lines[0]?.label ?? inv.id}
										</p>
										<p className="iz-tiny iz-muted">
											{inv.issueDate} · {inv.lines[0]?.detail}
										</p>
									</div>
								</div>
								<div className="text-right shrink-0">
									<p className="iz-sm font-bold">{formatRM(inv.amount)}</p>
									<IzPill
										variant={inv.status === "SETTLED" ? "green" : "amber"}
										className="!mt-1"
									>
										{inv.status === "SETTLED" ? "Paid" : inv.status}
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
														{weekLabel(inv.weekStart, inv.weekEnd)} ·{" "}
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
								const aging = inv.aging ? AGING_PILL[inv.aging] : null;
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
														{weekLabel(inv.weekStart, inv.weekEnd)}
														{inv.settledAt
															? ` · settled ${format(parseISO(inv.settledAt), "d MMM")}`
															: inv.issuedAt
																? ` · issued ${format(parseISO(inv.issuedAt), "d MMM")}`
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
