import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import { formatRM } from "@agency-portal/components/iz/ui";
import { AgencyHomeHubTabs } from "@agency-portal/components/portal/AgencyHomeHubTabs";
import { AiSuggestionsPanel } from "@agency-portal/components/portal/AiSuggestionsPanel";
import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import { OUTLET_NAMES, scopeToAgency } from "@agency-portal/lib/agency-demo";
import {
	agencyPendingPayoutDeadline,
	agencyPrToPayTotal,
} from "@agency-portal/lib/agency-payroll";
import { LIVE_SEED_PR_PVS } from "@agency-portal/lib/pr-demo";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export const Route = createFileRoute("/agency/")({
	component: AgencyHub,
});

/**
 * How many seats the venues are asking this agency to fill today.
 *
 * The home page could say what the agency OWES (pending payout), what it HOLDS
 * (total PR, total outlets) and what it must DECIDE (the review tabs) — but not
 * what it has been ASKED for, which is the one number that expires. An outlet
 * posts a shift for tonight and, until now, nothing on this screen changed.
 *
 * Reads the same `useAutoAssignPlan("today")` the AI suggestion panel beside it
 * already mounts, so this shares its query keys and fires no extra request. It
 * is the count only — never which venue or which agency is competing for the
 * same PRs — and it links to the roster where the staffing actually happens.
 *
 * Hidden at zero rather than showing "0": a KPI that is nearly always nought
 * teaches people to stop reading it, and the whole point of this tile is to be
 * noticed on the day it is not.
 */
function PrNeededKpi() {
	const { t } = usePortalLocale();
	const { backed, plan } = useAutoAssignPlan("today");
	if (!backed || plan.openSlotCount <= 0) return null;
	return (
		<Link
			to="/agency/roster"
			className="iz-portal-kpi iz-portal-kpi-payout no-underline"
		>
			<div className="l">{t.agencyHome.prNeeded}</div>
			<div className="n">{plan.openSlotCount}</div>
			<p className="iz-tiny mt-1 leading-snug text-[var(--iz-muted2)]">
				{plan.pairs.length > 0
					? fill(t.agencyHome.prNeededReady, { n: plan.pairs.length })
					: t.agencyHome.prNeededNobodyFree}
			</p>
		</Link>
	);
}

function AgencyHub() {
	const agencySubRole = useStore((s) => s.agencySubRole);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencyPRs = useMemo(
		() => scopeToAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const prPaymentVouchers = useStore((s) => s.prPaymentVouchers);
	// Real login → drive KPI tiles from the backend (PRs, PVs, outlet registry);
	// demo store otherwise. Same real-vs-demo split as the other wired screens.
	const backendOutlets = useAgencyOutlets();
	const backendPrs = useAgencyPrs();
	const backendPvs = useAgencyPvs();
	const backed = backendOutlets.backed;

	const prsForCalc = backed ? backendPrs.prs : (agencyPRs ?? []);
	const pvsForCalc = backed
		? backendPvs.pvs
		: prPaymentVouchers?.length
			? prPaymentVouchers
			: LIVE_SEED_PR_PVS;
	const prToPayTotal = useMemo(
		() => agencyPrToPayTotal(pvsForCalc, prsForCalc),
		[pvsForCalc, prsForCalc],
	);
	const payoutDeadline = useMemo(
		() => agencyPendingPayoutDeadline(pvsForCalc, prsForCalc),
		[pvsForCalc, prsForCalc],
	);
	/*
	 * The PENDING_REVIEW banner is GONE (owner, 24 Aug 2026).
	 *
	 * It ran the identical query to the hub's "Pending agency review" tab — same
	 * array, same `status === "PENDING_REVIEW"` filter, same
	 * `/agency/pv?status=PENDING_REVIEW` destination — so it was a second
	 * rendering of one fact, and the worse of the two: the tab's rows carry
	 * `?pv=<id>` and open the voucher, while the banner passed status alone and
	 * let `tabHoldingStatus` snap to the FIRST week holding one, landing on a
	 * list showing 1 of 3.
	 *
	 * Its copy had also outlived its own premise. "Until this is done, the PR
	 * sees nothing for last week" was true while `getMyHistory` filtered to
	 * signed+paid; that filter was deliberately widened to all five statuses, so
	 * the PR now sees a pending_review week with its full breakdown under the
	 * line "Waiting for your agency to issue". The banner was telling the agency
	 * something the PR's own screen contradicts.
	 *
	 * Visibility is not lost with it — the hub strip shows the count without a
	 * click. What went is the consequence sentence, and the accurate version of
	 * that is "the PR cannot sign, so cannot be paid", which belongs beside the
	 * list it describes if it ever comes back.
	 */
	const totalPrs = prsForCalc.filter((p) => !p.detached).length;
	const totalOutlets = backed
		? backendOutlets.outlets.length
		: OUTLET_NAMES.length;
	const isFinance = agencySubRole === "agency_finance";
	const showWorkforce = useAgencyCan()("viewWorkforce");
	const { t } = usePortalLocale();

	return (
		<div className="iz-screen iz-portal-page">
			<div className="iz-portal-kpi-grid iz-portal-desktop-only">
				<div className="iz-portal-kpi">
					<div className="l">{t.agencyHome.totalPr}</div>
					<div className="n">{totalPrs}</div>
				</div>
				<div className="iz-portal-kpi">
					<div className="l">{t.agencyHome.totalOutlets}</div>
					<div className="n">{totalOutlets}</div>
				</div>
				{/* Rendered only for roles that can actually staff a shift, so the
				    hook inside it — and its roster queries — never mount for
				    finance, who holds no `viewLiveFloor` and would 403 on some. */}
				{showWorkforce && !isFinance && <PrNeededKpi />}
				<Link
					to="/agency/pv"
					search={{ status: "TO_PAY" }}
					className="iz-portal-kpi iz-portal-kpi-payout no-underline"
				>
					<div className="l">{t.agencyHome.pendingPayout}</div>
					<div className="n">{formatRM(prToPayTotal)}</div>
					{payoutDeadline && prToPayTotal > 0 && (
						<p
							className={`iz-tiny mt-1 leading-snug ${
								payoutDeadline.isOverdue
									? "text-[var(--iz-red)]"
									: "text-[var(--iz-muted2)]"
							}`}
						>
							{payoutDeadline.isOverdue
								? `${t.agencyHome.overdue} · `
								: `${t.agencyHome.payBy} `}
							{payoutDeadline.payByLabel}
							{payoutDeadline.pvCount > 1
								? ` · ${payoutDeadline.pvCount} ${t.agencyHome.pvs}`
								: ""}
						</p>
					)}
				</Link>
			</div>

			<div className="iz-portal-home-grid">
				<div className="iz-portal-home-main">
					{/* Says what finance can DO, not which pages exist for it.
					    "payroll & PV only" was narrower than the role's actual reach —
					    finance also reads the roster (owner's call, 11 Aug 2026: keep it)
					    — so the banner contradicted the Roster item in its own sidebar.
					    Read-only is the part that matters and is still exactly true: every
					    write on the roster is gated on `assignShifts`, which finance does
					    not hold. */}
					{isFinance && (
						<p className="iz-tiny iz-muted mb-3 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
							{t.agencyHome.financeScopeBanner}
						</p>
					)}

					<AgencyHomeHubTabs agencySubRole={agencySubRole} />
				</div>

				{showWorkforce && !isFinance && (
					<aside className="iz-portal-home-aside iz-portal-desktop-only">
						<AiSuggestionsPanel />
					</aside>
				)}
			</div>

			<IconGuide className="iz-icon-guide--portal mt-6" />
		</div>
	);
}
