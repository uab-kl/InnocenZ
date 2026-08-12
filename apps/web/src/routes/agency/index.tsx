import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import { formatRM } from "@agency-portal/components/iz/ui";
import { AgencyHomeHubTabs } from "@agency-portal/components/portal/AgencyHomeHubTabs";
import { AiSuggestionsPanel } from "@agency-portal/components/portal/AiSuggestionsPanel";
import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
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

export const Route = createFileRoute("/agency/")({
	component: AgencyHub,
});

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
	const totalPrs = prsForCalc.filter((p) => !p.detached).length;
	const totalOutlets = backed
		? backendOutlets.outlets.length
		: OUTLET_NAMES.length;
	const isFinance = agencySubRole === "agency_finance";
	const showWorkforce = useAgencyCan()("viewWorkforce");

	return (
		<div className="iz-screen iz-portal-page">
			<div className="iz-portal-kpi-grid iz-portal-desktop-only">
				<div className="iz-portal-kpi">
					<div className="l">Total PR</div>
					<div className="n">{totalPrs}</div>
				</div>
				<div className="iz-portal-kpi">
					<div className="l">Total outlets</div>
					<div className="n">{totalOutlets}</div>
				</div>
				<Link
					to="/agency/pv"
					search={{ status: "TO_PAY" }}
					className="iz-portal-kpi iz-portal-kpi-payout no-underline"
				>
					<div className="l">Pending payout</div>
					<div className="n">{formatRM(prToPayTotal)}</div>
					{payoutDeadline && prToPayTotal > 0 && (
						<p
							className={`iz-tiny mt-1 leading-snug ${
								payoutDeadline.isOverdue
									? "text-[var(--iz-red)]"
									: "text-[var(--iz-muted2)]"
							}`}
						>
							{payoutDeadline.isOverdue ? "Overdue · " : "Pay by "}
							{payoutDeadline.payByLabel}
							{payoutDeadline.pvCount > 1
								? ` · ${payoutDeadline.pvCount} PVs`
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
							Payroll &amp; PV — you can review and sign vouchers. Roster and
							history are read-only.
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
